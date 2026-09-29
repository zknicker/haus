import Foundation

public struct AttachmentMetadata: Codable, Identifiable, Sendable, Equatable {
    public let filename: String
    public let id: String
    public let mediaType: String
    public let sizeBytes: Int

    public init(filename: String, id: String, mediaType: String, sizeBytes: Int) {
        self.filename = filename
        self.id = id
        self.mediaType = mediaType
        self.sizeBytes = sizeBytes
    }
}

public enum TaskStatus: String, Codable, Sendable {
    case todo
    case inProgress = "in_progress"
    case inReview = "in_review"
    case done
    case closed
}

public enum TaskPriority: String, Codable, Sendable {
    case none
    case urgent
    case high
    case medium
    case low
}

/// How the task row came to exist. `composed` is a human composing a message
/// as a task, `converted` a human promoting an existing message, and `claimed`
/// an Agent taking the claim before working a message nobody had promoted.
public enum TaskOrigin: String, Codable, Sendable {
    case composed
    case converted
    case claimed
}

/// Which lens a task belongs to. A `background` task is an Agent's own
/// record-keeping claim on work it finished inside one turn; it stays
/// queryable but stays off the default Board and List. Everything else is
/// `tracked`.
public enum TaskTier: String, Codable, Sendable {
    case background
    case tracked
}

public struct TaskLabel: Codable, Identifiable, Sendable, Equatable {
    public let color: String
    public let id: String
    public let name: String

    public init(color: String, id: String, name: String) {
        self.color = color
        self.id = id
        self.name = name
    }
}

public struct MessageTask: Codable, Identifiable, Sendable, Equatable {
    /// Tasks are Agent work (ADR 0037): only an Agent ever holds one.
    public let assigneeAgentID: String?
    public let chatID: String
    public let claimedAt: Date?
    public let createdAt: Date
    public let createdByAgentID: String?
    public let createdByUserID: String?
    public let labels: [TaskLabel]
    /// The assignee Agent is running a turn on this task right now.
    public let live: Bool
    public let messageID: String
    public let number: Int
    public let origin: TaskOrigin
    public let priority: TaskPriority
    public let status: TaskStatus
    public let threadChatID: String
    public let tier: TaskTier
    public let updatedAt: Date
    public let version: Int

    public var id: String { messageID }

    enum CodingKeys: String, CodingKey {
        case assigneeAgentID = "assigneeAgentId"
        case chatID = "chatId"
        case claimedAt
        case createdAt
        case createdByAgentID = "createdByAgentId"
        case createdByUserID = "createdByUserId"
        case labels
        case live
        case messageID = "messageId"
        case number
        case origin
        case priority
        case status
        case threadChatID = "threadChatId"
        case tier
        case updatedAt
        case version
    }
}
