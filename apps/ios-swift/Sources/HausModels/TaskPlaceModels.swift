import Foundation

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

    public var isClosed: Bool { self == .done || self == .canceled }
}

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

public struct TaskPreview: Codable, Identifiable, Equatable, Sendable {
    public let taskID: String
    public let chatID: String
    public let key: String
    public let title: String
    public let state: TaskState
    public let originMessageID: String
    public let recentMessages: [TaskMessagePreview]
    public let messageCount: Int
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

    public static func byOriginMessageID(_ previews: [TaskPreview]) -> [String: [TaskPreview]] {
        Dictionary(grouping: previews, by: \.originMessageID)
    }
}

struct LossyArray<Element: Decodable>: Decodable {
    let elements: [Element]

    init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        var elements: [Element] = []
        while !container.isAtEnd {
            if let element = try? container.decode(Element.self) {
                elements.append(element)
            } else {
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
    func decodeLossyArray<Element: Decodable>(_: Element.Type, forKey key: Key) throws -> [Element] {
        try decodeIfPresent(LossyArray<Element>.self, forKey: key)?.elements ?? []
    }
}
