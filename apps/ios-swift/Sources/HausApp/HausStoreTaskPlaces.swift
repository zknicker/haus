import Foundation
import HausModels
import HausUI

/// Tasks as places (ADR 0053): the followed Tasks waiting in the Inbox, the
/// previews under their origin Messages, and what a Task screen reads. A Task
/// Chat is opened as a Task, never as a Channel or DM.
extension HausStore {
    // MARK: - Unread Tasks

    /// The followed unread Tasks, less any Mark read still settling.
    var visibleUnreadTasks: [ChatUnreadPreview] {
        (taskSnapshots.unreadTasks ?? []).filter { markedReadThrough[$0.chatID] == nil }
    }

    /// One read for every unread row's preview; only the Task rows are kept,
    /// because the Chat list already owns the others.
    func loadUnreadTasks() async {
        guard let serverID = activeServer?.id else { return }
        let readStart = realtimeReconciliation.beginRead()
        do {
            let list: ChatUnreadPreviewList = try await client.query(
                "chat.unreadPreviews",
                input: ServerScopedInput(serverId: serverID)
            )
            guard activeServer?.id == serverID,
                  realtimeReconciliation.landed(.unreadTasks, readStartedAt: readStart)
            else { return }
            let tasks = list.taskPreviews
            if taskSnapshots.unreadTasks != tasks { taskSnapshots.unreadTasks = tasks }
        } catch {
            Self.logger.error("Loading unread tasks failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Whether an Unread row's id is a followed Task's Chat.
    func isUnreadTaskChat(_ chatID: String) -> Bool {
        taskSnapshots.unreadTasks?.contains { $0.chatID == chatID } == true
    }

    /// Mark read on a Task row: it leaves at once, the Server reads through the
    /// newest message it quoted, and the unread Tasks read again before the row
    /// may come back. A failed Mark read puts it back.
    func markTaskChatRead(chatID: String) async {
        guard let serverID = activeServer?.id,
              let preview = taskSnapshots.unreadTasks?.first(where: { $0.chatID == chatID }),
              let sequence = preview.messages.map(\.sequence).max()
        else { return }
        markedReadThrough[chatID] = sequence
        defer { markedReadThrough[chatID] = nil }
        do {
            let _: ChatReadReceipt = try await client.mutation(
                "chat.markRead",
                input: ChatReadInput(chatID: chatID, sequence: sequence, serverID: serverID)
            )
            guard activeServer?.id == serverID else { return }
            await loadUnreadTasks()
        } catch {
            Self.logger.error("Marking a task read failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// The Unread section's Task rows, named by title, key, and state and
    /// wearing the origin Channel's mark.
    var inboxUnreadTaskChats: [InboxUnreadTaskChat] {
        visibleUnreadTasks.compactMap { preview in
            guard let task = preview.task else { return nil }
            let newest = preview.messages.last
            let author = newest.flatMap { authorPresentation($0.author) }
            return InboxUnreadTaskChat(
                id: preview.chatID,
                taskID: task.taskID,
                key: task.key,
                title: task.title,
                state: task.state,
                mark: .channel(chatsByID[task.originChatID].map {
                    ChannelAppearance(icon: $0.icon, color: $0.color)
                } ?? ChannelAppearance(icon: nil, color: nil)),
                lastActivityAt: newest?.createdAt,
                latestMessage: newest.map {
                    ChatLastMessage(
                        authorDisplayName: author?.name ?? InboxActorName.stored($0.author),
                        content: $0.displayContent,
                        createdAt: $0.createdAt
                    )
                }
            )
        }
    }

    // MARK: - Realtime

    /// What one batch of events asks of Tasks as places: the previews whose
    /// origin a loaded transcript holds, the open Task screens, and the unread
    /// Tasks once this client holds them.
    func applyTaskPlaceEffects(_ effects: ChatRealtimeEffects) async {
        refreshTaskPreviews(effects.taskIDsToRefreshPreview, unknownTaskIDs: effects.changedTaskIDs)
        // Attached work reports through its linking Message's Chat: a Task
        // screen showing that work reads its Task again.
        let workTaskIDs = taskSnapshots.detailsByID.values
            .filter { $0.task.chatID.map(effects.cloudAgentWorkChatIDs.contains) == true }
            .map(\.task.id)
        await withTaskGroup(of: Void.self) { group in
            for taskID in workTaskIDs where !effects.changedTaskIDs.contains(taskID) {
                group.addTask { try? await self.reloadTaskDetail(taskID: taskID) }
            }
            if effects.reloadsUnreadTasks, taskSnapshots.unreadTasks != nil {
                group.addTask { await self.loadUnreadTasks() }
            }
        }
    }

    /// Re-reads each loaded origin Message previewing a changed Task through
    /// `chat.message`, whose `tasks` carry its previews. A Task no preview
    /// names yet — just started — is looked up only when an event said the
    /// Task itself changed, so a busy Task's messages never cost a Task read
    /// each.
    func refreshTaskPreviews(_ taskIDs: Set<String>, unknownTaskIDs: Set<String>) {
        guard !taskIDs.isEmpty else { return }
        let cached = transcripts.refreshes(previewingTasks: taskIDs)
        for refresh in Set(cached) { readOriginPage(refresh) }
        let named = Set(taskIDs.filter { transcripts.taskPreview(taskID: $0) != nil })
        for taskID in unknownTaskIDs.intersection(taskIDs).subtracting(named) {
            Task {
                if taskSnapshots.detailsByID[taskID] == nil {
                    try? await reloadTaskDetail(taskID: taskID)
                }
                guard let origin = taskSnapshots.detailsByID[taskID]?.task.origin,
                      transcripts.isListed(origin.messageID)
                else { return }
                readOriginPage(EntityRefresh(chatID: origin.chatID, messageID: origin.messageID))
            }
        }
    }

    /// One origin Message's previews: `chat.message` when its answer carries
    /// `tasks`, else one `chat.messages` read around it, for a Server whose
    /// single-message read predates them.
    private func readOriginPage(_ origin: EntityRefresh) {
        guard let serverID = activeServer?.id, !deletedChatIDs.contains(origin.chatID) else { return }
        Task {
            if let entity: ChatMessageEntity = try? await client.query("chat.message", input: ChatMessageInput(
                serverID: serverID, chatID: origin.chatID, messageID: origin.messageID
            )), entity.tasks != nil {
                guard activeServer?.id == serverID, !deletedChatIDs.contains(origin.chatID) else { return }
                publishTranscripts(transcripts.setEntity(entity))
                return
            }
            guard activeServer?.id == serverID else { return }
            guard let page: ChatMessagePage = try? await client.query("chat.messages", input: ChatMessagesInput(
                serverId: serverID, chatId: origin.chatID, limit: 1, aroundMessageId: origin.messageID
            )), activeServer?.id == serverID else { return }
            // A reseed rewrites the entities the lists already name, and
            // leaves their ids and paging alone.
            writeTranscript(page, to: .chat(origin.chatID), as: .reseed)
        }
    }
}
