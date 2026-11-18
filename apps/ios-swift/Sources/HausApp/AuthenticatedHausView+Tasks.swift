import HausModels
import HausUI
import SwiftUI

extension AuthenticatedHausView {
    @ViewBuilder
    func taskRouteDestination(_ route: HausRootRoute) -> some View {
        switch route {
        case .task(let taskID):
            taskDestination(taskID)
        }
    }

    /// A Task opens over whatever is showing, from a chip or an Inbox row.
    func openTask(_ taskID: String) {
        if path.last == .task(taskID: taskID) { return }
        path.append(.task(taskID: taskID))
    }

    func openTaskMention(_ mention: TaskMention) {
        openCanvasChat(.chat(mention.place.chatID), revealing: mention.messageID)
    }

    func openTaskReminder(_ reminder: TaskReminderRef) {
        if store.chatsByID[reminder.anchorChatID] == nil,
           let taskID = store.taskID(forChatID: reminder.anchorChatID) {
            openTask(taskID)
            return
        }
        openCanvasChat(.chat(reminder.anchorChatID))
    }

    var cloudAgentCancel: CloudAgentCancelAction? {
        guard store.canManageServer else { return nil }
        return CloudAgentCancelAction { [store] workID in try await store.cancelCloudAgent(workID: workID) }
    }
}
