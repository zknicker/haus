import Foundation

public enum ChatKind: String, Codable, Sendable {
    case channel
    case dm
    /// A Captain's one shared chat (ADR 0062); `peerAgentID` names its Captain.
    case captain
    case unknown

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = ChatKind(rawValue: raw) ?? .unknown
    }

    public var isListedConversation: Bool { self != .unknown }
}

/// The reader's flags on a Captain chat: whether they joined it and whether
/// its messages notify them.
public struct CaptainChatMembership: Codable, Sendable, Equatable {
    public let member: Bool
    public let subscribed: Bool

    public init(member: Bool, subscribed: Bool) {
        self.member = member
        self.subscribed = subscribed
    }
}

/// The newest top-level message of a Chat, as the line a list row quotes
/// beneath the Chat's name. `content` stays raw Markdown; collapsing it to one
/// plain line is the reader's job. Null until the Chat holds a message, or when
/// its author no longer resolves to a name.
public struct ChatLastMessage: Codable, Sendable, Equatable {
    public let authorDisplayName: String
    public let content: String
    public let createdAt: Date

    public init(authorDisplayName: String, content: String, createdAt: Date) {
        self.authorDisplayName = authorDisplayName
        self.content = content
        self.createdAt = createdAt
    }
}

public struct ChatSummary: Codable, Identifiable, Sendable, Equatable {
    public let archivedAt: Date?
    public let archivedByUserID: String?
    /// The reader's flags on a Captain chat; nil for every other kind.
    public var captainChat: CaptainChatMembership? = nil
    /// Channel appearance preset id, for example `violet`. Null on DMs and on
    /// channels that never picked one.
    public let color: String?
    public let createdAt: Date
    /// Channel description: what the channel is for. The Server trims it and
    /// stores blank as null; null on DMs, on channels that never set one, and
    /// on Servers older than the field.
    public let description: String?
    /// Channel appearance glyph, a curated hugeicons export name such as
    /// `RocketIcon`. Null on DMs and on channels that never picked one.
    public let icon: String?
    public let id: String
    public let isAll: Bool
    public let kind: ChatKind
    public let lastActivityAt: Date?
    public let lastMessage: ChatLastMessage?
    public let lastMessageSequence: Int
    public let name: String?
    public let participantAgentIDs: [String]
    public let participantUserIDs: [String]
    public let peerAgentDisplayName: String?
    public let peerAgentID: String?
    public let peerAgentRetired: Bool
    public let peerUserID: String?
    public let serverID: String
    public let unreadCount: Int

    /// Whether this conversation still takes new Messages.
    ///
    /// Two lifecycles end a conversation without deleting it: a Captain chat
    /// whose Captain was retired, and a Chat that was archived. Either leaves
    /// the transcript readable and takes the composer away. Haus App
    /// reads exactly this predicate as `readOnly`.
    public var isReadOnly: Bool {
        (kind == .captain && peerAgentRetired) || archivedAt != nil
    }

    /// The Captain whose chat this is; nil for every other kind.
    public var captainID: String? { kind == .captain ? peerAgentID : nil }

    enum CodingKeys: String, CodingKey {
        case archivedAt
        case archivedByUserID = "archivedByUserId"
        case captainChat
        case color
        case createdAt
        case description
        case icon
        case id
        case isAll
        case kind
        case lastActivityAt
        case lastMessage
        case lastMessageSequence
        case name
        case participantAgentIDs = "participantAgentIds"
        case participantUserIDs = "participantUserIds"
        case peerAgentDisplayName
        case peerAgentID = "peerAgentId"
        case peerAgentRetired
        case peerUserID = "peerUserId"
        case serverID = "serverId"
        case unreadCount
    }
}

/// `chat.get` returns the same shape as `chat.list`.
public typealias ChatDetail = ChatSummary

public struct ChatMessage: Codable, Identifiable, Sendable, Equatable {
    public let attachments: [AttachmentMetadata]
    public let author: ChatAuthor
    public let body: ChatMessageBody?
    /// The automation fire that produced this message, when the Server
    /// reported one. Decoded tolerantly in `ChatMessageCause.swift`.
    public let cause: ChatMessageCause?
    public let chatID: String
    public let content: String
    public let createdAt: Date
    public let id: String
    public let nonce: String
    /// The direct parent and chain root for an inline reply, when this Message
    /// was sent in a Channel or DM as a reply to another Message.
    public let reply: ChatMessageReply?
    /// Grouped emoji reactions, emoji by first arrival. Servers that predate
    /// reactions omit the field, so it decodes as empty.
    public var reactions: [ChatMessageReaction] = []
    public let runID: String?
    public let sequence: Int
    public let serverID: String
    /// The Agent session generation that produced this message. Null on human
    /// messages, and absent from Servers that predate the field, so it decodes
    /// tolerantly and no reader may require it.
    public let sessionGeneration: Int?
    public let claim: MessageClaim?
    /// The Tasks this Message references, in content order, resolved when it
    /// was written (ADR 0051). Each draws a chip over its `text`.
    public var taskLinks: [TaskLink] = []

    enum CodingKeys: String, CodingKey {
        case attachments
        case author
        case body
        case cause
        case chatID = "chatId"
        case content
        case createdAt
        case id
        case nonce
        case reactions
        case reply
        case runID = "runId"
        case sequence
        case serverID = "serverId"
        case sessionGeneration
        case claim
        case taskLinks
    }
}

public struct TaskMessagePreview: Codable, Identifiable, Sendable, Equatable {
    public let authorAgentID: String?
    public let authorUserID: String?
    public let content: String
    public let createdAt: Date
    public let id: String

    enum CodingKeys: String, CodingKey {
        case authorAgentID = "authorAgentId"
        case authorUserID = "authorUserId"
        case content
        case createdAt
        case id
    }
}
