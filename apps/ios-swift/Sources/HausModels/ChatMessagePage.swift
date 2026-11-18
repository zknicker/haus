import Foundation

public struct ChatMessagePage: Codable, Sendable, Equatable {
    public let messages: [ChatMessage]
    public let nextBeforeSequence: Int?
    public let nextAfterSequence: Int?
    /// The highest Chat sequence this read examined. A filtered read
    /// (`replyRootMessageId`) can scan past its last match, so a tail read
    /// resumes here rather than after the last message it returned.
    public let scannedThroughSequence: Int
    /// Tasks started from messages on this page, each under its origin
    /// (ADR 0053 decision 7). A Server that predates Tasks omits it.
    public let tasks: [TaskPreview]

    /// A page built locally (a merge or a fixture) scanned through its newest
    /// message unless told otherwise.
    public init(
        messages: [ChatMessage],
        nextBeforeSequence: Int?,
        nextAfterSequence: Int? = nil,
        scannedThroughSequence: Int? = nil,
        tasks: [TaskPreview] = []
    ) {
        self.messages = messages
        self.nextBeforeSequence = nextBeforeSequence
        self.nextAfterSequence = nextAfterSequence
        self.scannedThroughSequence = scannedThroughSequence ?? messages.map(\.sequence).max() ?? 0
        self.tasks = tasks
    }

    enum CodingKeys: String, CodingKey {
        case messages, nextBeforeSequence, nextAfterSequence, scannedThroughSequence, tasks
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        messages = try container.decode([ChatMessage].self, forKey: .messages)
        nextBeforeSequence = try container.decodeIfPresent(Int.self, forKey: .nextBeforeSequence)
        nextAfterSequence = try container.decodeIfPresent(Int.self, forKey: .nextAfterSequence)
        scannedThroughSequence = try container.decode(Int.self, forKey: .scannedThroughSequence)
        // A preview this build cannot read drops itself, never the page.
        tasks = try container.decodeLossyArray(TaskPreview.self, forKey: .tasks)
    }
}

/// `chat.message`: one message exactly as `chat.messages` projects it. The
/// read answers null when the id no longer resolves in the Chat.
public struct ChatMessageEntity: Codable, Sendable, Equatable {
    public let message: ChatMessage
    /// The Tasks started from this message (ADR 0053 decision 7), from its
    /// page or from `chat.message`'s own `tasks`. Nil when the read carried no
    /// `tasks` key (a Server that predates it), which keeps whatever a page
    /// read last said rather than clearing it. A preview this build cannot
    /// read drops itself, never the message.
    public let tasks: [TaskPreview]?

    public init(message: ChatMessage, tasks: [TaskPreview]? = nil) {
        self.message = message
        self.tasks = tasks
    }

    enum CodingKeys: String, CodingKey {
        case message, tasks
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        message = try container.decode(ChatMessage.self, forKey: .message)
        tasks = try container.decodeIfPresent(LossyArray<TaskPreview>.self, forKey: .tasks)?.elements
    }

    /// This entity, keeping `previous`'s Tasks when it carries none of its own.
    public func keepingTasks(of previous: ChatMessageEntity?) -> ChatMessageEntity {
        guard tasks == nil, let previousTasks = previous?.tasks else { return self }
        return ChatMessageEntity(message: message, tasks: previousTasks)
    }
}

/// `chat.message` input.
public struct ChatMessageInput: Encodable, Sendable, Equatable {
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
