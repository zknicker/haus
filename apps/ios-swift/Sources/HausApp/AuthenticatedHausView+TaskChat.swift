import HausModels
import HausUI
import SwiftUI

/// The pushed Task route (ADR 0053 decision 15). A Task with a Chat opens as
/// a chat with its attached-work header; a Task from before Tasks were places
/// has no Chat and opens a read-only details screen with no composer. Until
/// the Store knows which, the screen is blank rather than guessing.
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
        // The Task's own read decides the screen and names it; it reads on
        // every open so a Task opened from a stale preview is current.
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
            // A Task lives in its Channel: an archived Channel leaves the Task
            // readable and takes its composer away.
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
            // A Task composer mentions what its Channel's composer could.
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
        // The Task's Chat is the open Chat while its screen shows, so what the
        // reader sees here is what reads it. Opening it answers the
        // notifications its messages sent, from whichever surface opened it.
        .task(id: chatID) {
            guard let chatID else { return }
            await store.openChat(chatID: chatID)
            await push.clearDelivered(openedChatID: chatID)
        }
    }

    /// The Chat on screen when a Task route is on top: its own, once it opens
    /// as a place.
    func viewingTaskChatID(_ taskID: String) -> String? {
        store.opensTaskAsChat(taskID: taskID) == true ? store.taskChatID(taskID: taskID) : nil
    }
}
