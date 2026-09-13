import Foundation

public enum ChatKind: String, Codable, Sendable {
    case channel
    case dm
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
    /// Channel appearance preset id, for example `violet`. Null on DMs and on
    /// channels that never picked one.
    public let color: String?
    public let createdAt: Date
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
    /// Two lifecycles end a conversation without deleting it: a DM whose peer
    /// Agent was retired, and a Chat that was archived. Either leaves the
    /// transcript readable and takes the composer away — and with it every
    /// answer control, because an Ask here can no longer be settled. Haus App
    /// reads exactly this predicate as `readOnly`.
    public var isReadOnly: Bool {
        (kind == .dm && peerAgentRetired) || archivedAt != nil
    }

    enum CodingKeys: String, CodingKey {
        case archivedAt
        case archivedByUserID = "archivedByUserId"
        case color
        case createdAt
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

public struct ChatAuthorProfile: Codable, Sendable, Equatable {
    public let avatarURL: String?
    public let deleted: Bool
    public let description: String?
    public let displayName: String

    enum CodingKeys: String, CodingKey {
        case avatarURL = "avatarUrl"
        case deleted
        case description
        case displayName
    }

    public init(avatarURL: String?, deleted: Bool, description: String?, displayName: String) {
        self.avatarURL = avatarURL
        self.deleted = deleted
        self.description = description
        self.displayName = displayName
    }
}

public enum ChatAuthor: Codable, Sendable, Equatable {
    case agent(agentID: String, profile: ChatAuthorProfile?)
    case human(profile: ChatAuthorProfile?, userID: String)
    /// Retired on the Server: every message it writes now carries a `human` or
    /// `agent` author. The case survives only so historical pages still decode,
    /// and nothing may require a transcript to contain one.
    case system(SystemAuthor)

    /// Server-defined system author values. Decoding is tolerant of any value
    /// this build does not yet know about: an `unknown` case preserves the raw
    /// wire string instead of failing the whole message page, since new system
    /// authors ship on the Server independent of client releases.
    public enum SystemAuthor: Codable, Sendable, Equatable {
        case reminder
        case session
        // Production history can still contain retired task receipts. The UI filters
        // system-authored rows, but decoding must preserve access to the chat page.
        case task
        case trigger
        case unknown(String)

        public init(from decoder: Decoder) throws {
            let raw = try decoder.singleValueContainer().decode(String.self)
            switch raw {
            case "reminder": self = .reminder
            case "session": self = .session
            case "task": self = .task
            case "trigger": self = .trigger
            default: self = .unknown(raw)
            }
        }

        public func encode(to encoder: Encoder) throws {
            var container = encoder.singleValueContainer()
            switch self {
            case .reminder: try container.encode("reminder")
            case .session: try container.encode("session")
            case .task: try container.encode("task")
            case .trigger: try container.encode("trigger")
            case .unknown(let raw): try container.encode(raw)
            }
        }
    }

    public var kind: Kind {
        switch self {
        case .agent: return .agent
        case .human: return .human
        case .system: return .system
        }
    }

    public enum Kind: String, Sendable {
        case agent
        case human
        case system
    }

    private enum CodingKeys: String, CodingKey {
        case agentID = "agentId"
        case kind
        case profile
        case system
        case userID = "userId"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .kind) {
        case "agent":
            self = .agent(
                agentID: try container.decode(String.self, forKey: .agentID),
                profile: try container.decodeIfPresent(ChatAuthorProfile.self, forKey: .profile)
            )
        case "human":
            self = .human(
                profile: try container.decodeIfPresent(ChatAuthorProfile.self, forKey: .profile),
                userID: try container.decode(String.self, forKey: .userID)
            )
        case "system":
            self = .system(try container.decode(SystemAuthor.self, forKey: .system))
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .kind,
                in: container,
                debugDescription: "Unknown Haus Chat author kind."
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .agent(agentID, profile):
            try container.encode("agent", forKey: .kind)
            try container.encode(agentID, forKey: .agentID)
            try container.encodeIfPresent(profile, forKey: .profile)
        case let .human(profile, userID):
            try container.encode("human", forKey: .kind)
            try container.encode(userID, forKey: .userID)
            try container.encodeIfPresent(profile, forKey: .profile)
        case let .system(system):
            try container.encode("system", forKey: .kind)
            try container.encode(system, forKey: .system)
        }
    }
}

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
    public let runID: String?
    public let sequence: Int
    public let serverID: String
    /// The Agent session generation that produced this message. Null on human
    /// messages, and absent from Servers that predate the field, so it decodes
    /// tolerantly and no reader may require it.
    public let sessionGeneration: Int?
    public let task: MessageTask?

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
        case runID = "runId"
        case sequence
        case serverID = "serverId"
        case sessionGeneration
        case task
    }
}

public struct ThreadReplyPreview: Codable, Identifiable, Sendable, Equatable {
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

public struct ThreadSummary: Codable, Identifiable, Sendable, Equatable {
    public let anchorMessageID: String
    public let followed: Bool
    public let latestReplyAt: Date?
    public let recentReplies: [ThreadReplyPreview]
    public let replyCount: Int
    public let threadChatID: String
    public let unreadCount: Int

    enum CodingKeys: String, CodingKey {
        case anchorMessageID = "anchorMessageId"
        case followed
        case latestReplyAt
        case recentReplies
        case replyCount
        case threadChatID = "threadChatId"
        case unreadCount
    }

    public var id: String { threadChatID }
}
