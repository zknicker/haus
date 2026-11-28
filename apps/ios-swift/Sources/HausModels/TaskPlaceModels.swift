import Foundation

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

/// A Task as its origin Channel previews it under the Message it started
/// from: its newest messages and whether it is archived.
public struct TaskPreview: Codable, Identifiable, Equatable, Sendable {
    public let taskID: String
    public let chatID: String
    public let shortID: String
    public let title: String
    public let archivedAt: Date?
    public let originMessageID: String
    public let recentMessages: [TaskMessagePreview]
    public let messageCount: Int
    public let unreadCount: Int
    public let followed: Bool

    public var id: String { taskID }
    public var isArchived: Bool { archivedAt != nil }

    enum CodingKeys: String, CodingKey {
        case taskID = "taskId"
        case chatID = "chatId"
        case shortID = "shortId"
        case title
        case archivedAt
        case originMessageID = "originMessageId"
        case recentMessages
        case messageCount
        case unreadCount
        case followed
    }

    public init(
        taskID: String,
        chatID: String,
        shortID: String,
        title: String,
        archivedAt: Date? = nil,
        originMessageID: String,
        recentMessages: [TaskMessagePreview] = [],
        messageCount: Int,
        unreadCount: Int = 0,
        followed: Bool = false
    ) {
        self.taskID = taskID
        self.chatID = chatID
        self.shortID = shortID
        self.title = title
        self.archivedAt = archivedAt
        self.originMessageID = originMessageID
        self.recentMessages = recentMessages
        self.messageCount = messageCount
        self.unreadCount = unreadCount
        self.followed = followed
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
