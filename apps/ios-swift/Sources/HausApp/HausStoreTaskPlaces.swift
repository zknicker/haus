import Foundation
import HausModels
import HausUI

extension HausStore {
    // MARK: - Unread Tasks

    var visibleUnreadTasks: [ChatUnreadPreview] {
        (taskSnapshots.unreadTasks ?? []).filter { markedReadThrough[$0.chatID] == nil }
    }

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

    func isUnreadTaskChat(_ chatID: String) -> Bool {
        taskSnapshots.unreadTasks?.contains { $0.chatID == chatID } == true
    }

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
                mark: .channel(chatsByID[task.projectID].map {
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

    func applyTaskPlaceEffects(_ effects: ChatRealtimeEffects) async {
        refreshTaskPreviews(effects.taskIDsToRefreshPreview, unknownTaskIDs: effects.changedTaskIDs)
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
            writeTranscript(page, to: .chat(origin.chatID), as: .reseed)
        }
    }
}
