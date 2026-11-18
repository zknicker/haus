import Foundation

// (specs/realtime-events.md). Ids and small facts only, like the Chat family's.

public enum ClaimChangeKind: String, Decodable, Sendable, Equatable {
    case created
    case updated
}

/// `claim.onChanged`: a claim on one message was created or changed.
public struct ClaimChangedEvent: Decodable, Sendable, Equatable {
    public let serverID: String
    public let chatID: String
    public let messageID: String
    public let kind: ClaimChangeKind

    public init(serverID: String, chatID: String, messageID: String, kind: ClaimChangeKind) {
        self.serverID = serverID
        self.chatID = chatID
        self.messageID = messageID
        self.kind = kind
    }

    enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
        case chatID = "chatId"
        case messageID = "messageId"
        case kind
    }
}

/// `taskLabel.onUpdated`: a label was created, renamed, recolored, or deleted.
public struct TaskLabelUpdatedEvent: Decodable, Sendable, Equatable {
    public let serverID: String
    public let labelID: String

    public init(serverID: String, labelID: String) {
        self.serverID = serverID
        self.labelID = labelID
    }

    enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
        case labelID = "labelId"
    }
}

/// `task.onCreated` and `task.onUpdated` share one payload: a Task was created,
public struct TaskChangedEvent: Decodable, Sendable, Equatable {
    public let serverID: String
    public let taskID: String
    public let chatID: String?
    public let version: Int

    public init(serverID: String, taskID: String, chatID: String? = nil, version: Int) {
        self.serverID = serverID
        self.taskID = taskID
        self.chatID = chatID
        self.version = version
    }

    enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
        case taskID = "taskId"
        case chatID = "chatId"
        case version
    }
}

public struct TaskFollowUpdatedEvent: Decodable, Sendable, Equatable {
    public let serverID: String
    public let taskID: String
    public let chatID: String
    public let followed: Bool

    public init(serverID: String, taskID: String, chatID: String, followed: Bool) {
        self.serverID = serverID
        self.taskID = taskID
        self.chatID = chatID
        self.followed = followed
    }

    enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
        case taskID = "taskId"
        case chatID = "chatId"
        case followed
    }
}
