import Foundation

/// What an unread Task row names beyond its messages.
public struct ChatUnreadPreviewTask: Codable, Hashable, Sendable {
    public let archivedAt: Date?
    public let projectID: String
    public let shortID: String
    public let taskID: String
    public let title: String

    public init(archivedAt: Date? = nil, projectID: String, shortID: String, taskID: String, title: String) {
        self.archivedAt = archivedAt
        self.projectID = projectID
        self.shortID = shortID
        self.taskID = taskID
        self.title = title
    }

    enum CodingKeys: String, CodingKey {
        case archivedAt
        case projectID = "projectId"
        case shortID = "shortId"
        case taskID = "taskId"
        case title
    }
}

public struct ChatUnreadPreview: Decodable, Equatable, Sendable {
    public let chatID: String
    public let earlierUnreadCount: Int
    public let messages: [ChatMessage]
    public let task: ChatUnreadPreviewTask?

    public init(chatID: String, earlierUnreadCount: Int, messages: [ChatMessage], task: ChatUnreadPreviewTask?) {
        self.chatID = chatID
        self.earlierUnreadCount = earlierUnreadCount
        self.messages = messages
        self.task = task
    }

    public var unreadCount: Int { earlierUnreadCount + messages.count }

    enum CodingKeys: String, CodingKey {
        case chatID = "chatId"
        case earlierUnreadCount
        case messages
        case task
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        chatID = try container.decode(String.self, forKey: .chatID)
        earlierUnreadCount = try container.decodeIfPresent(Int.self, forKey: .earlierUnreadCount) ?? 0
        messages = try container.decodeLossyArray(ChatMessage.self, forKey: .messages)
        task = try container.decodeIfPresent(ChatUnreadPreviewTask.self, forKey: .task)
    }
}

public struct ChatUnreadPreviewList: Decodable, Sendable, Equatable {
    public let previews: [ChatUnreadPreview]

    public init(previews: [ChatUnreadPreview]) {
        self.previews = previews
    }

    enum CodingKeys: String, CodingKey {
        case previews
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        previews = try container.decodeLossyArray(ChatUnreadPreview.self, forKey: .previews)
    }

    public var taskPreviews: [ChatUnreadPreview] {
        previews.filter { $0.task != nil && $0.unreadCount > 0 }
    }
}
