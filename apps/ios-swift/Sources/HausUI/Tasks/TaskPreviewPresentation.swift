import Foundation
import HausModels

/// A Task's state as a person reads it, never the wire enum. Mirrors the App's
/// `taskStateLabels` (`features/tasks/task-state.ts`).
public enum TaskStateLabel {
    public static func text(_ state: TaskState) -> String {
        switch state {
        case .todo: "Todo"
        case .open: "Open"
        case .done: "Done"
        case .canceled: "Canceled"
        // A state this build does not know still reads as words.
        case .unknown: "Unknown state"
        }
    }
}

/// One Task as its origin Message previews it in a Channel (ADR 0053 decision
/// 7): its state, key, and title, how much it holds, and its newest messages.
public struct TaskPreviewPresentation: Identifiable, Hashable, Sendable {
    public let taskID: String
    /// The Task's own Chat.
    public let chatID: String
    public let key: String
    public let title: String
    public let state: TaskState
    public let messageCount: Int
    /// Zero unless the viewer follows the Task.
    public let unreadCount: Int
    /// The Server's newest messages, oldest first and already capped by it.
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

    /// `1 message`, `3 messages`: the App's `taskPreviewCounts`.
    public var messagesLabel: String {
        "\(messageCount) \(messageCount == 1 ? "message" : "messages")"
    }

    /// `2 new` for a follower with something waiting; nil otherwise.
    public var unreadLabel: String? {
        unreadCount > 0 ? "\(unreadCount) new" : nil
    }

    /// The facts line under the title: state, size, and what is new.
    public var summaryLine: String {
        ([stateLabel, messagesLabel] + [unreadLabel].compactMap { $0 }).joined(separator: " · ")
    }

    /// The App's `taskPreviewLabel`: the Task, its state, and its counts.
    public var accessibilityLabel: String {
        (["Open task \(key)", title, stateLabel, messagesLabel] + [unreadLabel].compactMap { $0 })
            .joined(separator: ", ")
    }
}

/// The one place a Server Task preview becomes the origin Message's preview.
/// The App layer resolves authors from its directories; a message whose author
/// cannot be resolved is dropped rather than drawn as an unknown face.
public enum TaskPreviewProjection {
    /// How many recent messages a preview quotes, as the Server caps them.
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

    /// Each origin Message's previews, in the page's order.
    public static func presentations(
        _ previews: [TaskPreview],
        resolveAuthor: (TaskMessagePreview) -> MessageAuthorPresentation?
    ) -> [String: [TaskPreviewPresentation]] {
        TaskPreview.byOriginMessageID(previews).mapValues { group in
            group.map { presentation(for: $0, resolveAuthor: resolveAuthor) }
        }
    }
}
