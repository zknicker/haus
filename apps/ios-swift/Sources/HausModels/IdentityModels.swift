import Foundation

public enum ServerRole: String, Codable, Sendable {
    case owner
    case admin
    case member
}

public struct ServerSummary: Codable, Identifiable, Sendable, Equatable {
    public let displayName: String
    public let id: String
    public let role: ServerRole
    public let slug: String

    public init(displayName: String, id: String, role: ServerRole, slug: String) {
        self.displayName = displayName
        self.id = id
        self.role = role
        self.slug = slug
    }
}

public struct ServerChannel: Codable, Identifiable, Sendable, Equatable {
    public let id: String
    public let name: String

    public init(id: String, name: String) {
        self.id = id
        self.name = name
    }
}

public struct ServerDetail: Codable, Identifiable, Sendable, Equatable {
    public let displayName: String
    public let id: String
    public let role: ServerRole
    public let slug: String
    public let channels: [ServerChannel]
    public let viewerUserID: String

    enum CodingKeys: String, CodingKey {
        case displayName
        case id
        case role
        case slug
        case channels
        case viewerUserID = "viewerUserId"
    }

    public init(
        displayName: String,
        id: String,
        role: ServerRole,
        slug: String,
        channels: [ServerChannel],
        viewerUserID: String
    ) {
        self.displayName = displayName
        self.id = id
        self.role = role
        self.slug = slug
        self.channels = channels
        self.viewerUserID = viewerUserID
    }
}

public enum AgentAvailability: String, Codable, Sendable {
    case error
    case idle
    case offline
    case stopped
    case working
}

public enum AgentReasoningEffort: String, Codable, CaseIterable, Sendable, Equatable, Hashable {
    case `default`
    case low
    case medium
    case high
    case xhigh
    case max
}

public enum AgentStatus: String, Codable, Sendable {
    case applied
    case degraded
    case pending
}

/// The Server currently returns one full Agent shape for both `agent.list` and
/// `agent.get`. Keeping the summary complete means the native UI can project
/// lighter rows without losing fields when the list is cached.
public struct AgentSummary: Codable, Identifiable, Sendable, Equatable {
    public let availability: AgentAvailability
    public let avatarURL: String?
    public let computerID: String
    public let createdAt: Date
    public let createdByUserID: String?
    public let description: String?
    public let desiredModelID: String
    /// Older cached/development fixtures predate this Server field. Missing
    /// values retain the contract's `medium` default at the creation boundary.
    public let desiredReasoningEffort: AgentReasoningEffort?
    public let desiredRuntimeID: String
    public let displayName: String
    public let dmChatID: String?
    public let effectiveModelID: String?
    public let effectiveReasoningEffort: AgentReasoningEffort?
    public let effectiveReportedAt: Date?
    public let effectiveRuntimeID: String?
    public let handle: String
    public let id: String
    public let missingResources: [String]
    public let serverID: String
    public let status: AgentStatus
    /// Set while the Server has paused automatic wakes after repeated
    /// failures. Servers that predate the field omit it.
    public var wakePause: AgentWakePause? = nil

    enum CodingKeys: String, CodingKey {
        case availability
        case avatarURL = "avatarUrl"
        case computerID = "computerId"
        case createdAt
        case createdByUserID = "createdByUserId"
        case description
        case desiredModelID = "desiredModelId"
        case desiredReasoningEffort
        case desiredRuntimeID = "desiredRuntimeId"
        case displayName
        case dmChatID = "dmChatId"
        case effectiveModelID = "effectiveModelId"
        case effectiveReasoningEffort
        case effectiveReportedAt
        case effectiveRuntimeID = "effectiveRuntimeId"
        case handle
        case id
        case missingResources
        case serverID = "serverId"
        case status
        case wakePause
    }
}

/// `agent.get` shares the same wire schema as `agent.list` today.
public typealias AgentDetail = AgentSummary

public enum MemberRole: String, Codable, Sendable {
    case owner
    case admin
    case member
}

public struct MemberSummary: Codable, Identifiable, Sendable, Equatable {
    public let avatarURL: String?
    public let description: String?
    public let displayName: String?
    public let email: String?
    public let handle: String?
    public let joinedAt: Date
    public let role: MemberRole
    /// The human's IANA zone; nil until an App reports one or on older Servers.
    public let timezone: String?
    public let userID: String

    enum CodingKeys: String, CodingKey {
        case avatarURL = "avatarUrl"
        case description
        case displayName
        case email
        case handle
        case joinedAt
        case role
        case timezone
        case userID = "userId"
    }

    public var id: String { userID }
}

/// `member.get` and directory rows use the same Server-backed identity shape.
public typealias MemberDetail = MemberSummary

public struct MemberList: Codable, Sendable, Equatable {
    public let members: [MemberSummary]
    public let viewerRole: MemberRole
    public let viewerUserID: String

    enum CodingKeys: String, CodingKey {
        case members
        case viewerRole
        case viewerUserID = "viewerUserId"
    }

    public init(members: [MemberSummary], viewerRole: MemberRole, viewerUserID: String) {
        self.members = members
        self.viewerRole = viewerRole
        self.viewerUserID = viewerUserID
    }
}

public typealias MemberDirectory = MemberList
