import HausModels
import HausUI
import SwiftUI

extension AuthenticatedHausView {
    func openTaskMention(_ mention: TaskMention) {
        router.open(route(forChatID: mention.place.chatID, messageID: mention.messageID))
    }

    func openTaskReminder(_ reminder: TaskReminderRef) {
        router.open(route(forChatID: reminder.anchorChatID))
    }

    var cloudAgentCancel: WorkerCancelAction? {
        guard store.canManageServer else { return nil }
        return WorkerCancelAction { [store] workID in try await store.cancelWorker(workID: workID) }
    }
}
