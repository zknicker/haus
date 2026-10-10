import Foundation

// Focused realtime payloads (specs/realtime-events.md). Each Chat-family
// stream has its own subscription and its own payload; every payload carries
// ids and small facts, never rows. The Store answers each one with a read, so
// a duplicate, late, or reordered event converges on the Server's answer.

/// `chat.onMessageCreated`: a message committed. A Thread reply names both its
/// parent Chat and the parent's anchor; other messages name neither.
public struct MessageCreatedEvent: Decodable, Sendable, Equatable {
    public let serverID: String
    public let chatID: String
    public let parentChatID: String?
    public let messageID: String
    public let sequence: Int
    public let threadAnchorMessageID: String?

    public init(
        serverID: String,
        chatID: String,
        parentChatID: String? = nil,
        messageID: String,
        sequence: Int,
        threadAnchorMessageID: String? = nil
    ) {
        self.serverID = serverID
        self.chatID = chatID
        self.parentChatID = parentChatID
        self.messageID = messageID
        self.sequence = sequence
        self.threadAnchorMessageID = threadAnchorMessageID
    }

    enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
        case chatID = "chatId"
        case parentChatID = "parentChatId"
        case messageID = "messageId"
        case sequence
        case threadAnchorMessageID = "threadAnchorMessageId"
    }
}

/// `chat.onMessageReactionUpdated`: one message's reaction set changed.
public struct MessageReactionUpdatedEvent: Decodable, Sendable, Equatable {
    public let serverID: String
    public let chatID: String
    public let parentChatID: String?
    public let messageID: String

    public init(serverID: String, chatID: String, parentChatID: String? = nil, messageID: String) {
        self.serverID = serverID
        self.chatID = chatID
        self.parentChatID = parentChatID
        self.messageID = messageID
    }

    enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
        case chatID = "chatId"
        case parentChatID = "parentChatId"
        case messageID = "messageId"
    }
}

/// `chat.onRead`: the viewer's own read marker moved. A Thread read names its
/// parent Chat and the parent's anchor, whose summary carries the unread count.
public struct ChatReadEvent: Decodable, Sendable, Equatable {
    public let serverID: String
    public let chatID: String
    public let parentChatID: String?
    public let sequence: Int
    public let threadAnchorMessageID: String?

    public init(
        serverID: String,
        chatID: String,
        parentChatID: String? = nil,
        sequence: Int,
        threadAnchorMessageID: String? = nil
    ) {
        self.serverID = serverID
        self.chatID = chatID
        self.parentChatID = parentChatID
        self.sequence = sequence
        self.threadAnchorMessageID = threadAnchorMessageID
    }

    enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
        case chatID = "chatId"
        case parentChatID = "parentChatId"
        case sequence
        case threadAnchorMessageID = "threadAnchorMessageId"
    }
}

/// `thread.onFollowUpdated`: the viewer followed or unfollowed a Thread.
public struct ThreadFollowUpdatedEvent: Decodable, Sendable, Equatable {
    public let serverID: String
    public let threadChatID: String
    public let parentChatID: String
    public let anchorMessageID: String
    public let followed: Bool

    public init(
        serverID: String,
        threadChatID: String,
        parentChatID: String,
        anchorMessageID: String,
        followed: Bool
    ) {
        self.serverID = serverID
        self.threadChatID = threadChatID
        self.parentChatID = parentChatID
        self.anchorMessageID = anchorMessageID
        self.followed = followed
    }

    enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
        case threadChatID = "threadChatId"
        case parentChatID = "parentChatId"
        case anchorMessageID = "anchorMessageId"
        case followed
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

public enum TaskChangeKind: String, Decodable, Sendable, Equatable {
    case created
    case updated
}

/// `task.onChanged`: a task on one message was created or changed.
public struct TaskChangedEvent: Decodable, Sendable, Equatable {
    public let serverID: String
    public let chatID: String
    public let messageID: String
    public let kind: TaskChangeKind

    public init(serverID: String, chatID: String, messageID: String, kind: TaskChangeKind) {
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

/// `cloudAgentWork.onUpdated`: one Cloud Agent work row changed. `messageID`
/// is the work Message whose card shows it.
public struct CloudAgentWorkUpdatedEvent: Decodable, Sendable, Equatable {
    public let serverID: String
    public let chatID: String
    public let parentChatID: String?
    public let messageID: String
    public let workID: String

    public init(
        serverID: String,
        chatID: String,
        parentChatID: String? = nil,
        messageID: String,
        workID: String
    ) {
        self.serverID = serverID
        self.chatID = chatID
        self.parentChatID = parentChatID
        self.messageID = messageID
        self.workID = workID
    }

    enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
        case chatID = "chatId"
        case parentChatID = "parentChatId"
        case messageID = "messageId"
        case workID = "workId"
    }
}

/// `server.onUpdated`: the Server's name or membership changed. The stream is
/// also the membership sentinel; its refusal, not this payload, reports loss.
public struct ServerUpdatedEvent: Decodable, Sendable, Equatable {
    public let serverID: String

    public init(serverID: String) {
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
    }
}

/// One live Chat-family notification, as the Store buffers it.
public enum ChatRealtimeEvent: Sendable, Equatable {
    case messageCreated(MessageCreatedEvent)
    case reactionUpdated(MessageReactionUpdatedEvent)
    case read(ChatReadEvent)
    case threadFollowUpdated(ThreadFollowUpdatedEvent)
    case lifecycle(ChatLifecycleEvent)
    case taskChanged(TaskChangedEvent)
    case taskLabelUpdated(TaskLabelUpdatedEvent)
    case cloudAgentWorkUpdated(CloudAgentWorkUpdatedEvent)

    public var serverID: String {
        switch self {
        case let .messageCreated(event): event.serverID
        case let .reactionUpdated(event): event.serverID
        case let .read(event): event.serverID
        case let .threadFollowUpdated(event): event.serverID
        case let .lifecycle(event): event.serverID
        case let .taskChanged(event): event.serverID
        case let .taskLabelUpdated(event): event.serverID
        case let .cloudAgentWorkUpdated(event): event.serverID
        }
    }
}
