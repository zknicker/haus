import Foundation
import HausModels

/// A Task as its origin Channel previews it under the message it started from.
public struct TaskPreviewPresentation: Identifiable, Hashable, Sendable {
    public let taskID: String
    public let chatID: String
    public let shortID: String
    public let title: String
    public let isArchived: Bool
    public let messageCount: Int
    public let unreadCount: Int
    public let recentMessages: [TaskMessagePreviewPresentation]

    public var id: String { taskID }

    public init(
        taskID: String,
        chatID: String,
        shortID: String,
        title: String,
        isArchived: Bool,
        messageCount: Int,
        unreadCount: Int,
        recentMessages: [TaskMessagePreviewPresentation]
    ) {
        self.taskID = taskID
        self.chatID = chatID
        self.shortID = shortID
        self.title = title
        self.isArchived = isArchived
        self.messageCount = messageCount
        self.unreadCount = unreadCount
        self.recentMessages = recentMessages
    }

    public var disc: TaskDiscState { TaskDiscState(isArchived: isArchived, status: nil) }

    public var messagesLabel: String {
        "\(messageCount) \(messageCount == 1 ? "message" : "messages")"
    }

    public var unreadLabel: String? {
        unreadCount > 0 ? "\(unreadCount) new" : nil
    }

    public var summaryLine: String {
        ((isArchived ? ["Archived"] : []) + [messagesLabel] + [unreadLabel].compactMap { $0 })
            .joined(separator: " · ")
    }

    public var accessibilityLabel: String {
        (["Open task", title, disc.label, messagesLabel] + [unreadLabel].compactMap { $0 })
            .joined(separator: ", ")
    }
}

public enum TaskPreviewProjection {
    public static let recentMessageLimit = 3

    public static func presentation(
        for preview: TaskPreview,
        resolveAuthor: (TaskMessagePreview) -> MessageAuthorPresentation?
    ) -> TaskPreviewPresentation {
        TaskPreviewPresentation(
            taskID: preview.taskID,
            chatID: preview.chatID,
            shortID: preview.shortID,
            title: preview.title,
            isArchived: preview.isArchived,
            messageCount: preview.messageCount,
            unreadCount: preview.unreadCount,
            recentMessages: preview.recentMessages.suffix(recentMessageLimit).compactMap { message in
                guard let author = resolveAuthor(message) else { return nil }
                return TaskMessagePreviewPresentation(
                    id: message.id,
                    author: author,
                    content: message.content,
                    createdAt: message.createdAt
                )
            }
        )
    }

    public static func presentations(
        _ previews: [TaskPreview],
        resolveAuthor: (TaskMessagePreview) -> MessageAuthorPresentation?
    ) -> [String: [TaskPreviewPresentation]] {
        TaskPreview.byOriginMessageID(previews).mapValues { group in
            group.map { presentation(for: $0, resolveAuthor: resolveAuthor) }
        }
    }
}
