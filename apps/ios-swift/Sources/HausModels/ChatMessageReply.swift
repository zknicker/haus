import Foundation

/// The bounded parent and root snapshots carried by an inline reply.
///
/// The Server keeps the full message in the ordinary Chat history. These
/// references are only enough to render the reply context without a second
/// lookup, and intentionally use the same author contract as a Chat message.
public struct ChatMessageReplyReference: Codable, Identifiable, Sendable, Equatable {
    public let author: ChatAuthor
    public let content: String
    public let createdAt: Date
    public let id: String
    public let sequence: Int
}

public struct ChatMessageReply: Codable, Sendable, Equatable {
    public let parent: ChatMessageReplyReference
    public let parentMessageID: String
    public let root: ChatMessageReplyReference
    public let rootMessageID: String

    enum CodingKeys: String, CodingKey {
        case parent
        case parentMessageID = "parentMessageId"
        case root
        case rootMessageID = "rootMessageId"
    }
}
