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

public enum ServerOnboardingPhase: String, Codable, Sendable {
    case applying
    case awaitingComputer = "awaiting-computer"
    case awaitingCove = "awaiting-cove"
    case complete
}

public enum ServerOnboardingFailureCode: String, Codable, Sendable {
    case applicationFailed = "application-failed"
    case computerDisconnected = "computer-disconnected"
    case computerIncompatible = "computer-incompatible"
    case inventoryEmpty = "inventory-empty"
    case inventoryInvalid = "inventory-invalid"
}

public struct ServerOnboardingFailure: Codable, Sendable, Equatable {
    public let code: ServerOnboardingFailureCode
    public let detail: String

    public init(code: ServerOnboardingFailureCode, detail: String) {
        self.code = code
        self.detail = detail
    }
}

public struct ServerOnboarding: Codable, Sendable, Equatable {
    public let agentID: String?
    public let applicationID: String?
    public let channelID: String
    public let computerID: String?
    public let failure: ServerOnboardingFailure?
    public let modelID: String?
    public let phase: ServerOnboardingPhase
    public let runtimeID: String?

    enum CodingKeys: String, CodingKey {
        case agentID = "agentId"
        case applicationID = "applicationId"
        case channelID = "channelId"
        case computerID = "computerId"
        case failure
        case modelID = "modelId"
        case phase
        case runtimeID = "runtimeId"
    }

    public init(
        agentID: String?,
        applicationID: String?,
        channelID: String,
        computerID: String?,
        failure: ServerOnboardingFailure?,
        modelID: String?,
        phase: ServerOnboardingPhase,
        runtimeID: String?
    ) {
        self.agentID = agentID
        self.applicationID = applicationID
        self.channelID = channelID
        self.computerID = computerID
        self.failure = failure
        self.modelID = modelID
        self.phase = phase
        self.runtimeID = runtimeID
    }
}

public struct ServerDetail: Codable, Identifiable, Sendable, Equatable {
    public let displayName: String
    public let id: String
    public let role: ServerRole
    public let slug: String
    public let channels: [ServerChannel]
    public let onboarding: ServerOnboarding
    public let viewerUserID: String

    enum CodingKeys: String, CodingKey {
        case displayName
        case id
        case role
        case slug
        case channels
        case onboarding
        case viewerUserID = "viewerUserId"
    }

    public init(
        displayName: String,
        id: String,
        role: ServerRole,
        slug: String,
        channels: [ServerChannel],
        onboarding: ServerOnboarding,
        viewerUserID: String
    ) {
        self.displayName = displayName
        self.id = id
        self.role = role
        self.slug = slug
        self.channels = channels
        self.onboarding = onboarding
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

public enum AgentReasoningEffort: String, Codable, CaseIterable, Sendable, Equatable {
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

public enum AgentFactoryKind: String, Codable, Sendable {
    case cove
    case ordinary
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
    public let effectiveReportedAt: Date?
    public let effectiveRuntimeID: String?
    public let factoryKind: AgentFactoryKind
    public let handle: String
    public let id: String
    public let missingResources: [String]
    public let serverID: String
    public let status: AgentStatus

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
        case effectiveReportedAt
        case effectiveRuntimeID = "effectiveRuntimeId"
        case factoryKind
        case handle
        case id
        case missingResources
        case serverID = "serverId"
        case status
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
    public let userID: String

    enum CodingKeys: String, CodingKey {
        case avatarURL = "avatarUrl"
        case description
        case displayName
        case email
        case handle
        case joinedAt
        case role
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
