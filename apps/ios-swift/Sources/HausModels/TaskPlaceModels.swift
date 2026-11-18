import Foundation

/// A Task's state (ADR 0052 decision 2): `todo` is not started, `open` is being
/// worked, and `done` or `canceled` ends it. A state this build does not know
/// decodes as `unknown`, so a newer Server never fails a page or a Task read.
public enum TaskState: String, Codable, Hashable, Sendable {
    case todo
    case open
    case done
    case canceled
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = TaskState(rawValue: raw) ?? .unknown
    }

    /// Done or canceled: the Task has ended.
    public var isClosed: Bool { self == .done || self == .canceled }
}

/// The Channel Message a Task started from (ADR 0052 decision 3).
public struct TaskOrigin: Codable, Hashable, Sendable {
    public let chatID: String
    public let messageID: String

    public init(chatID: String, messageID: String) {
        self.chatID = chatID
        self.messageID = messageID
    }

    enum CodingKeys: String, CodingKey {
        case chatID = "chatId"
        case messageID = "messageId"
    }
}

/// A Task as its origin Channel previews it under the Message it started from
/// (ADR 0052 decision 7), its recent conversation plus its state.
/// One origin Message can carry several. Rides `chat.messages` pages as `tasks`.
public struct TaskPreview: Codable, Identifiable, Equatable, Sendable {
    public let taskID: String
    /// The Task's own Chat, which opens it.
    public let chatID: String
    public let key: String
    public let title: String
    public let state: TaskState
    /// The Channel Message the Task started from; the preview sits under it.
    public let originMessageID: String
    /// The Task's newest messages, oldest first; the Server caps them at three.
    public let recentMessages: [TaskMessagePreview]
    public let messageCount: Int
    /// The viewer's unread messages in the Task; zero unless followed.
    public let unreadCount: Int
    public let followed: Bool

    public var id: String { taskID }

    enum CodingKeys: String, CodingKey {
        case taskID = "taskId"
        case chatID = "chatId"
        case key
        case title
        case state
        case originMessageID = "originMessageId"
        case recentMessages
        case messageCount
        case unreadCount
        case followed
    }

    public init(
        taskID: String,
        chatID: String,
        key: String,
        title: String,
        state: TaskState,
        originMessageID: String,
        recentMessages: [TaskMessagePreview] = [],
        messageCount: Int,
        unreadCount: Int = 0,
        followed: Bool = false
    ) {
        self.taskID = taskID
        self.chatID = chatID
        self.key = key
        self.title = title
        self.state = state
        self.originMessageID = originMessageID
        self.recentMessages = recentMessages
        self.messageCount = messageCount
        self.unreadCount = unreadCount
        self.followed = followed
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        taskID = try container.decode(String.self, forKey: .taskID)
        chatID = try container.decode(String.self, forKey: .chatID)
        key = try container.decode(String.self, forKey: .key)
        title = try container.decode(String.self, forKey: .title)
        state = try container.decode(TaskState.self, forKey: .state)
        originMessageID = try container.decode(String.self, forKey: .originMessageID)
        recentMessages = try container.decodeIfPresent([TaskMessagePreview].self, forKey: .recentMessages) ?? []
        messageCount = try container.decodeIfPresent(Int.self, forKey: .messageCount) ?? recentMessages.count
        unreadCount = try container.decodeIfPresent(Int.self, forKey: .unreadCount) ?? 0
        followed = try container.decodeIfPresent(Bool.self, forKey: .followed) ?? false
    }

    /// The previews in their Server order, grouped under each origin Message.
    public static func byOriginMessageID(_ previews: [TaskPreview]) -> [String: [TaskPreview]] {
        Dictionary(grouping: previews, by: \.originMessageID)
    }
}

/// An array that drops elements this build cannot decode instead of failing
/// the whole read: one malformed or newer row costs only itself.
struct LossyArray<Element: Decodable>: Decodable {
    let elements: [Element]

    init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        var elements: [Element] = []
        while !container.isAtEnd {
            if let element = try? container.decode(Element.self) {
                elements.append(element)
            } else {
                // Consumes any value, so the container always advances.
                _ = try container.decode(SkippedElement.self)
            }
        }
        self.elements = elements
    }

    private struct SkippedElement: Decodable {
        init(from decoder: Decoder) throws {}
    }
}

extension KeyedDecodingContainer {
    /// `[Element]` that tolerates a missing key and undecodable elements.
    func decodeLossyArray<Element: Decodable>(_: Element.Type, forKey key: Key) throws -> [Element] {
        try decodeIfPresent(LossyArray<Element>.self, forKey: key)?.elements ?? []
    }
}
