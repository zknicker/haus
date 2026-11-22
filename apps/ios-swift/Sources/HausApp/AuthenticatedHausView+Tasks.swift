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
}
