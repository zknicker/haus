import Foundation

public struct ChatMessagePage: Codable, Sendable, Equatable {
    public let messages: [ChatMessage]
    public let nextBeforeSequence: Int?
    public let nextAfterSequence: Int?
    /// The highest Chat sequence this read examined. A filtered read
    /// (`replyRootMessageId`) can scan past its last match, so a tail read
    /// resumes here rather than after the last message it returned.
    public let scannedThroughSequence: Int
    public let threads: [ThreadSummary]

    /// A page built locally (a merge or a fixture) scanned through its newest
    /// message unless told otherwise.
    public init(
        messages: [ChatMessage],
        nextBeforeSequence: Int?,
        nextAfterSequence: Int? = nil,
        scannedThroughSequence: Int? = nil,
        threads: [ThreadSummary]
    ) {
        self.messages = messages
        self.nextBeforeSequence = nextBeforeSequence
        self.nextAfterSequence = nextAfterSequence
        self.scannedThroughSequence = scannedThroughSequence ?? messages.map(\.sequence).max() ?? 0
        self.threads = threads
    }
}

/// `chat.message`: one message exactly as `chat.messages` projects it, with
/// the viewer's Thread summary when the message anchors one. The read answers
/// null when the id no longer resolves in the Chat.
public struct ChatMessageEntity: Codable, Sendable, Equatable {
    public let message: ChatMessage
    public let thread: ThreadSummary?

    public init(message: ChatMessage, thread: ThreadSummary?) {
        self.message = message
        self.thread = thread
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
