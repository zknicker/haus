import HausModels
import HausUI
import SwiftUI

/// The root stack's routes. A Task is a push on the root stack, so Back
/// returns to whichever canvas is showing. It never selects the canvas Chat; a
/// Task that is a place opens its own.
extension AuthenticatedHausView {
    @ViewBuilder
    func taskRouteDestination(_ route: HausRootRoute) -> some View {
        switch route {
        case .task(let taskID):
            // A Task opens as a chat once it is a place (ADR 0052).
            taskDestination(taskID)
        }
    }

    /// A Task opens over whatever is showing, from a chip or an Inbox row.
    func openTask(_ taskID: String) {
        if path.last == .task(taskID: taskID) { return }
        path.append(.task(taskID: taskID))
    }

    /// A mention opens its Channel or DM at the message.
    func openTaskMention(_ mention: TaskMention) {
        openCanvasChat(.chat(mention.place.chatID), revealing: mention.messageID)
    }

    /// A Reminder answers where it is anchored: a Channel or DM, or a Task.
    func openTaskReminder(_ reminder: TaskReminderRef) {
        // A Reminder set on a Task anchors in the Task's own Chat (ADR 0052
        // decision 16), which opens as its Task.
        if store.chatsByID[reminder.anchorChatID] == nil,
           let taskID = store.taskID(forChatID: reminder.anchorChatID) {
            openTask(taskID)
            return
        }
        openCanvasChat(.chat(reminder.anchorChatID))
    }

    /// Owners and Admins may cancel a live Cloud Agent run from its card.
    var cloudAgentCancel: CloudAgentCancelAction? {
        guard store.canManageServer else { return nil }
        return CloudAgentCancelAction { [store] workID in try await store.cancelCloudAgent(workID: workID) }
    }
}
