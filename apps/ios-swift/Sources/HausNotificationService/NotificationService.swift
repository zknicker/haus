import HausModels
import OSLog
import UserNotifications

/// Turns a Haus push into a communication notification: the sender's avatar
/// with the Haus icon as a corner badge, like Messages. Any failure, or iOS
/// running out of time, delivers the push exactly as the Server sent it.
final class NotificationService: UNNotificationServiceExtension, @unchecked Sendable {
    static let logger = Logger(subsystem: "chat.haus.ios.NotificationService", category: "push")

    // iOS calls `didReceive` and `serviceExtensionTimeWillExpire` on different
    // threads; the lock makes delivery happen exactly once.
    private let lock = NSLock()
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var original: UNNotificationContent?
    private var work: Task<Void, Never>?

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        // UNNotificationContent is immutable, so sharing it with the task is safe.
        nonisolated(unsafe) let original = request.content
        lock.withLock {
            self.contentHandler = contentHandler
            self.original = original
        }
        guard let communication = PushNotificationCommunication(userInfo: original.userInfo) else {
            deliver(original)
            return
        }
        let task = Task { [weak self] in
            let content = await CommunicationNotification.content(from: original, communication: communication)
            self?.deliver(content ?? original)
        }
        lock.withLock { work = task }
    }

    override func serviceExtensionTimeWillExpire() {
        let (task, original) = lock.withLock { (work, self.original) }
        task?.cancel()
        if let original {
            deliver(original)
        }
    }

    private func deliver(_ content: UNNotificationContent) {
        let handler = lock.withLock {
            let handler = contentHandler
            contentHandler = nil
            return handler
        }
        handler?(content)
    }
}
