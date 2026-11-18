import Foundation
import HausModels

public enum TaskStateLabel {
    public static func text(_ state: TaskState) -> String {
        switch state {
        case .todo: "Todo"
        case .open: "Open"
        case .done: "Done"
        case .canceled: "Canceled"
        case .unknown: "Unknown state"
        }
    }
}

public struct TaskPreviewPresentation: Identifiable, Hashable, Sendable {
    public let taskID: String
    public let chatID: String
    public let key: String
    public let title: String
    public let state: TaskState
    public let messageCount: Int
    public let unreadCount: Int
    public let recentMessages: [TaskMessagePreviewPresentation]

    public var id: String { taskID }

    public init(
        taskID: String,
        chatID: String,
        key: String,
        title: String,
        state: TaskState,
        messageCount: Int,
        unreadCount: Int,
        recentMessages: [TaskMessagePreviewPresentation]
    ) {
        self.taskID = taskID
        self.chatID = chatID
        self.key = key
        self.title = title
        self.state = state
        self.messageCount = messageCount
        self.unreadCount = unreadCount
        self.recentMessages = recentMessages
    }

    public var stateLabel: String { TaskStateLabel.text(state) }

    public var messagesLabel: String {
        "\(messageCount) \(messageCount == 1 ? "message" : "messages")"
    }

    public var unreadLabel: String? {
        unreadCount > 0 ? "\(unreadCount) new" : nil
    }

    public var summaryLine: String {
        ([stateLabel, messagesLabel] + [unreadLabel].compactMap { $0 }).joined(separator: " · ")
    }

    public var accessibilityLabel: String {
        (["Open task \(key)", title, stateLabel, messagesLabel] + [unreadLabel].compactMap { $0 })
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
            key: preview.key,
            title: preview.title,
            state: preview.state,
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
