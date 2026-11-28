import Foundation
import HausModels
import HausUI

extension HausStore {
    // MARK: - Unread Tasks

    var visibleUnreadTasks: [ChatUnreadPreview] {
        (tasks.unreadTasks ?? []).filter { markedReadThrough[$0.chatID] == nil }
    }

    func loadUnreadTasks() async {
        await tasks.refreshUnreadTasks()
    }

    func isUnreadTaskChat(_ chatID: String) -> Bool {
        tasks.isUnreadTaskChat(chatID)
    }

    func markTaskChatRead(chatID: String) async {
        guard let serverID = activeServer?.id,
              let preview = tasks.unreadTasks?.first(where: { $0.chatID == chatID }),
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

    // MARK: - Realtime

    func applyTaskPlaceEffects(_ effects: ChatRealtimeEffects) async {
        refreshTaskPreviews(effects.taskIDsToRefreshPreview, unknownTaskIDs: effects.changedTaskIDs)
        if effects.reloadsUnreadTasks, tasks.unreadTasks != nil {
            await loadUnreadTasks()
        }
    }

    func refreshTaskPreviews(_ taskIDs: Set<String>, unknownTaskIDs: Set<String>) {
        guard !taskIDs.isEmpty else { return }
        let cached = transcripts.refreshes(previewingTasks: taskIDs)
        for refresh in Set(cached) { readOriginPage(refresh) }
        let named = Set(taskIDs.filter { transcripts.taskPreview(taskID: $0) != nil })
        for taskID in unknownTaskIDs.intersection(taskIDs).subtracting(named) {
            Task {
                if tasks.detailsByID[taskID] == nil {
                    try? await reloadTaskDetail(taskID: taskID)
                }
                guard let origin = tasks.detailsByID[taskID]?.task.origin,
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
