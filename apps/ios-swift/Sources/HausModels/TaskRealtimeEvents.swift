import Foundation

// Focused realtime payloads for claims, labels, boards, and Tasks
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

/// `board.onUpdated`: a board was created, renamed, re-keyed, archived, or had
/// its columns set.
public struct BoardUpdatedEvent: Decodable, Sendable, Equatable {
    public let boardID: String
    public let serverID: String
    public let version: Int

    public init(boardID: String, serverID: String, version: Int) {
        self.boardID = boardID
        self.serverID = serverID
        self.version = version
    }

    enum CodingKeys: String, CodingKey {
        case boardID = "boardId"
        case serverID = "serverId"
        case version
    }
}

/// `task.onCreated` and `task.onUpdated` share one payload: a Task was created,
/// or edited, moved, assigned, or gained a reference. Ids only.
public struct TaskChangedEvent: Decodable, Sendable, Equatable {
    public let boardID: String
    public let serverID: String
    public let taskID: String
    public let version: Int

    public init(boardID: String, serverID: String, taskID: String, version: Int) {
        self.boardID = boardID
        self.serverID = serverID
        self.taskID = taskID
        self.version = version
    }

    enum CodingKeys: String, CodingKey {
        case boardID = "boardId"
        case serverID = "serverId"
        case taskID = "taskId"
        case version
    }
}

/// `taskInbox.onChanged`: the reader's Task items changed. Delivered only to
/// `userID`.
public struct TaskInboxChangedEvent: Decodable, Sendable, Equatable {
    public let serverID: String
    public let userID: String

    public init(serverID: String, userID: String) {
        self.serverID = serverID
        self.userID = userID
    }

    enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
        case userID = "userId"
    }
}
