import Foundation

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
