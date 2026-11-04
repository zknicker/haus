import HausModels
import HausUI
import SwiftUI

/// The Tasks routes. Boards and Tasks are pushes on the root stack, like a
/// Thread, so Back walks Task → board → boards → whichever canvas is showing.
/// None of them selects a Chat: a Task has no Chat of its own.
extension AuthenticatedHausView {
    @ViewBuilder
    func taskRouteDestination(_ route: HausRootRoute) -> some View {
        switch route {
        case .tasks:
            TaskBoardPickerView(source: store.taskBoardSource) { boardID in
                path.append(.board(boardID: boardID))
            }
        case .board(let boardID):
            TaskBoardView(boardID: boardID, source: store.taskBoardSource) { taskID in
                path.append(.task(taskID: taskID))
            }
        case .task(let taskID):
            TaskDetailView(
                taskID: taskID,
                source: store.taskBoardSource,
                onOpenMention: openTaskMention,
                onOpenReminder: openTaskReminder
            )
            // Opening the Task answers its Inbox item and its notification,
            // from whichever surface opened it. Being seen in a list never does.
            .task {
                await store.clearTaskInboxItemOnOpen(taskID: taskID)
                await push.clearDelivered(openedChatID: taskID)
            }
        case .thread(let thread):
            threadDestination(thread)
        }
    }

    /// A Task opens over whatever is showing, from a chip or an Inbox row.
    func openTask(_ taskID: String) {
        if path.last == .task(taskID: taskID) { return }
        path.append(.task(taskID: taskID))
    }

    /// A message in a Thread opens that Thread; any other opens its Chat, at
    /// the message.
    private func openTaskMention(_ mention: TaskMention) {
        guard mention.threadAnchorMessageID != nil else {
            openCanvasChat(.chat(mention.chatID), revealing: mention.messageID)
            return
        }
        pushThread(threadChatID: mention.chatID)
    }

    /// A Reminder answers where it is anchored: a Channel, a DM, or a Thread.
    private func openTaskReminder(_ reminder: TaskReminderRef) {
        guard store.chatsByID[reminder.anchorChatID] == nil else {
            openCanvasChat(.chat(reminder.anchorChatID))
            return
        }
        pushThread(threadChatID: reminder.anchorChatID)
    }

    private func pushThread(threadChatID: String) {
        Task {
            guard let selection = await store.threadSelection(threadChatID: threadChatID) else { return }
            pushThread(selection, selectingParent: nil)
        }
    }
}
