import HausAppModel
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
            startedFrom: store.taskStartedFrom(taskID: taskID),
            onOpenOrigin: {
                guard let origin else { return }
                router.open(route(forChatID: origin.chatID, messageID: origin.messageID))
            },
            messages: { chatID.map { store.messagePresentations(chatID: $0) } ?? [] },
            isLoaded: store.isTaskChatLoaded(chatID: chatID),
            isConnected: store.isConnected,
            isReadOnly: origin.flatMap { store.chatsByID[$0.chatID]?.isReadOnly } ?? false,
            draft: store.draftBinding(for: .task(taskID)),
            composerInteraction: store.composerInteraction(for: .task(taskID)),
            onSend: { content, attachments in
                guard let chatID else { return false }
                return await store.send(content, to: chatID, attachments: attachments)
            },
            onOpenAttachment: { attachment in
                try await store.downloadAttachment(attachment)
            },
            history: chatID.map { store.messageHistory(chatID: $0) } ?? .init(),
            engagementChatID: chatID,
            landingMessageID: router.revealedMessageID(in: .task(taskID)),
            editing: store.taskChatEditing(taskID: taskID),
            workPill: store.workPill(.task(taskID), now: .now),
            onOpenWork: { router.open(.work(.task(taskID))) },
            onOpenWorker: { router.open(.worker(workerID: $0)) },
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
        .task(id: chatID) { await store.loadWork(.task(taskID), includingFiles: false) }
    }

    func viewingTaskChatID(_ taskID: String) -> String? {
        store.opensTaskAsChat(taskID: taskID) == true ? store.taskChatID(taskID: taskID) : nil
    }
}
