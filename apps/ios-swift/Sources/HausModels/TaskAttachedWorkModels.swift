import Foundation

public struct TaskReminderSetter: Codable, Hashable, Sendable {
    public let agentID: String
    public let displayName: String

    public init(agentID: String, displayName: String) {
        self.agentID = agentID
        self.displayName = displayName
    }

    enum CodingKeys: String, CodingKey {
        case agentID = "agentId"
        case displayName
    }
}

public struct ChatUnreadPreviewTask: Codable, Hashable, Sendable {
    public let taskID: String
    public let key: String
    public let title: String
    public let state: TaskState
    public let projectID: String

    public init(taskID: String, key: String, title: String, state: TaskState, projectID: String) {
        self.taskID = taskID
        self.key = key
        self.title = title
        self.state = state
        self.projectID = projectID
    }

    enum CodingKeys: String, CodingKey {
        case taskID = "taskId"
        case key
        case title
        case state
        case projectID = "projectId"
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
