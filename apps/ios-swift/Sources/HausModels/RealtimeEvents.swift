import Foundation

// Focused realtime payloads (specs/realtime-events.md). Each Chat-family
// stream has its own subscription and its own payload; every payload carries
// ids and small facts, never rows. The Store answers each one with a read, so
// a duplicate, late, or reordered event converges on the Server's answer.

/// `chat.onMessageCreated`: a message committed.
public struct MessageCreatedEvent: Decodable, Sendable, Equatable {
    public let serverID: String
    public let chatID: String
    public let messageID: String
    public let sequence: Int
    public let taskID: String?

    public init(serverID: String, chatID: String, messageID: String, sequence: Int, taskID: String? = nil) {
        self.serverID = serverID
        self.chatID = chatID
        self.messageID = messageID
        self.sequence = sequence
        self.taskID = taskID
    }

    enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
        case chatID = "chatId"
        case messageID = "messageId"
        case sequence
        case taskID = "taskId"
    }
}

/// `chat.onMessageReactionUpdated`: one message's reaction set changed.
public struct MessageReactionUpdatedEvent: Decodable, Sendable, Equatable {
    public let serverID: String
    public let chatID: String
    public let messageID: String

    public init(serverID: String, chatID: String, messageID: String) {
        self.serverID = serverID
        self.chatID = chatID
        self.messageID = messageID
    }

    enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
        case chatID = "chatId"
        case messageID = "messageId"
    }
}

/// `chat.onRead`: the viewer's own read marker moved.
public struct ChatReadEvent: Decodable, Sendable, Equatable {
    public let serverID: String
    public let chatID: String
    public let sequence: Int
    public let taskID: String?

    public init(serverID: String, chatID: String, sequence: Int, taskID: String? = nil) {
        self.serverID = serverID
        self.chatID = chatID
        self.sequence = sequence
        self.taskID = taskID
    }

    enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
        case chatID = "chatId"
        case sequence
        case taskID = "taskId"
    }
}

public enum ChatLifecycleAction: String, Decodable, Sendable, Equatable {
    case archived
    case created
    case deleted
    case unarchived
    case updated
}

/// `chat.onLifecycle`: one Chat's existence changed.
public struct ChatLifecycleEvent: Decodable, Sendable, Equatable {
    public let serverID: String
    public let chatID: String
    public let action: ChatLifecycleAction

    public init(serverID: String, chatID: String, action: ChatLifecycleAction) {
        self.serverID = serverID
        self.chatID = chatID
        self.action = action
    }

    enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
        case chatID = "chatId"
        case action
    }
}

/// One live Chat-family notification, as the Store buffers it.
public enum ChatRealtimeEvent: Sendable, Equatable {
    case messageCreated(MessageCreatedEvent)
    case reactionUpdated(MessageReactionUpdatedEvent)
    case read(ChatReadEvent)
    case lifecycle(ChatLifecycleEvent)
    case claimChanged(ClaimChangedEvent)
    case taskChanged(TaskChangedEvent)
    case taskFollowUpdated(TaskFollowUpdatedEvent)

    public var serverID: String {
        switch self {
        case let .messageCreated(event): event.serverID
        case let .reactionUpdated(event): event.serverID
        case let .read(event): event.serverID
        case let .lifecycle(event): event.serverID
        case let .claimChanged(event): event.serverID
        case let .taskChanged(event): event.serverID
        case let .taskFollowUpdated(event): event.serverID
        }
    }
}
