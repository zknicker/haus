import HausModels
import HausUI
import SwiftUI

extension AuthenticatedHausView {
    @ViewBuilder
    func taskDestination(_ taskID: String) -> some View {
        Group {
            switch store.opensTaskAsChat(taskID: taskID) {
            case true?:
                taskChatDestination(taskID)
            case false?:
                TaskDetailView(
                    taskID: taskID,
                    source: store.taskDetailSource,
                    onOpenMention: openTaskMention,
                    onOpenReminder: openTaskReminder
                )
            case nil:
                Color.clear
            }
        }
        .task { try? await store.reloadTaskDetail(taskID: taskID) }
    }

    private func taskChatDestination(_ taskID: String) -> some View {
        let chatID = store.taskChatID(taskID: taskID)
        let origin = store.taskOrigin(taskID: taskID)
        let originDestination = origin.flatMap { origin in
            store.chatDestinations.first { $0.durableChat?.id == origin.chatID }
        }
        return TaskChatView(
            header: store.taskChatHeader(taskID: taskID),
            contextLabel: store.taskContextLabel(taskID: taskID),
            startedFrom: store.taskStartedFrom(taskID: taskID),
            onOpenOrigin: {
                guard let origin else { return }
                openCanvasChat(.chat(origin.chatID), revealing: origin.messageID)
            },
            messages: { chatID.map { store.messagePresentations(chatID: $0) } ?? [] },
            isLoaded: store.isTaskChatLoaded(chatID: chatID),
            isConnected: store.isConnected,
            isReadOnly: origin.flatMap { store.chatsByID[$0.chatID]?.isReadOnly } ?? false,
            onSend: { content, attachments in
                guard let chatID else { return false }
                return await store.send(content, to: chatID, attachments: attachments)
            },
            onOpenAttachment: { attachment in
                try await store.downloadAttachment(attachment)
            },
            history: chatID.map { store.messageHistory(chatID: $0) } ?? .init(),
            engagementChatID: chatID,
            mentionOptions: originDestination.map { store.mentionOptions(for: $0) } ?? [],
            onLoadMentionOptions: {
                guard let originDestination else { return }
                await store.loadMentionOptions(for: originDestination)
            },
            onVisibleMessagesChange: { messageIDs in
                guard let chatID else { return }
                store.reportVisibleMessages(chatID: chatID, messageIDs: messageIDs)
            }
        )
        .task(id: chatID) {
            guard let chatID else { return }
            await store.openChat(chatID: chatID)
            await push.clearDelivered(openedChatID: chatID)
        }
    }

    func viewingTaskChatID(_ taskID: String) -> String? {
        store.opensTaskAsChat(taskID: taskID) == true ? store.taskChatID(taskID: taskID) : nil
    }
}
