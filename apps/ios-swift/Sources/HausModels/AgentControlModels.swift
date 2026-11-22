import Foundation

public enum AgentAvatarMediaType: String, Encodable, CaseIterable, Sendable {
    case jpeg = "image/jpeg"
    case png = "image/png"
    case webp = "image/webp"
}

public struct AgentAvatarUpload: Encodable, Equatable, Sendable {
    public let bytesBase64: String
    public let mediaType: AgentAvatarMediaType

    public init(bytesBase64: String, mediaType: AgentAvatarMediaType) {
        self.bytesBase64 = bytesBase64
        self.mediaType = mediaType
    }
}

public enum ParticipantHandle {
    public static let reserved: Set<String> = [
        "agent", "agents", "all", "busy", "everyone", "haus", "here", "human", "humans", "idle", "system",
    ]

    public static func isValid(_ handle: String) -> Bool {
        let normalized = handle.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return normalized.wholeMatch(of: /[a-z0-9][a-z0-9-]{1,30}/) != nil && !reserved.contains(normalized)
    }
}

public struct CreateAgentInput: Encodable, Equatable, Sendable {
    public let avatar: AgentAvatarUpload?
    public let computerID: String
    public let description: String?
    public let displayName: String
    public let handle: String
    public let homeProjectID: String
    public let modelID: String
    public let reasoningEffort: AgentReasoningEffort
    public let runtimeID: String
    public let serverID: String
    public let signatureEmoji: String?

    public init?(
        computerID: String,
        displayName: String,
        handle: String,
        homeProjectID: String,
        modelID: String,
        reasoningEffort: AgentReasoningEffort = .medium,
        runtimeID: String,
        serverID: String,
        description: String? = nil,
        avatar: AgentAvatarUpload? = nil,
        signatureEmoji: String? = nil
    ) {
        let trimmedName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...80).contains(trimmedName.utf16.count),
              ParticipantHandle.isValid(handle),
              (1...128).contains(modelID.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count),
              (1...64).contains(runtimeID.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count)
        else { return nil }
        self.avatar = avatar
        self.computerID = computerID
        self.description = description
        self.displayName = displayName
        self.handle = handle
        self.homeProjectID = homeProjectID
        self.modelID = modelID
        self.reasoningEffort = reasoningEffort
        self.runtimeID = runtimeID
        self.serverID = serverID
        self.signatureEmoji = signatureEmoji
    }

    enum CodingKeys: String, CodingKey {
        case avatar, description, displayName, handle, reasoningEffort, signatureEmoji
        case computerID = "computerId"
        case homeProjectID = "homeProjectId"
        case modelID = "modelId"
        case runtimeID = "runtimeId"
        case serverID = "serverId"
    }
}

public struct AgentCreated: Decodable, Equatable, Sendable {
    public let agent: AgentSummary
}

public struct AgentDeliveryState: Decodable, Hashable, Sendable {
    public let agentID: String
    public let pending: Int
    public let running: Bool
    public let stopped: Bool

    enum CodingKeys: String, CodingKey {
        case pending, running, stopped
        case agentID = "agentId"
    }
}

public struct AgentUpdatedEvent: Decodable, Sendable, Equatable {
    public let agentID: String?
    public let serverID: String

    enum CodingKeys: String, CodingKey {
        case agentID = "agentId"
        case serverID = "serverId"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        agentID = try container.decode(String?.self, forKey: .agentID)
        serverID = try container.decode(String.self, forKey: .serverID)
    }
}

public enum AgentProcedures {
    public static let turns = HausProcedure<AgentTurnsInput, [AgentTurn]>.query("agent.turns")
    public static let activityHistory = HausProcedure<AgentActivityHistoryInput, AgentActivityHistoryPage>
        .query("agent.activityHistory")
    public static let activeActivity = HausProcedure<ServerScopeInput, AgentActiveActivitySnapshot>
        .query("agent.activeActivity")
    public static let create = HausProcedure<CreateAgentInput, AgentCreated>.mutation("agent.create")
    public static let stop = HausProcedure<AgentTarget, AgentDeliveryState>.mutation("agent.stop")
    public static let deliveryState = HausProcedure<AgentTarget, AgentDeliveryState>.query("agent.deliveryState")
    public static let configure = HausProcedure<ConfigureAgentInput, AgentSummary>.mutation("agent.configure")
    public static let executionOutlines = HausProcedure<AgentExecutionOutlinesInput, AgentExecutionOutlines>
        .query("agent.executionOutlines")
    public static let executionJournal = HausProcedure<AgentRunTarget, AgentExecutionJournalResult>
        .query("agent.executionJournal")
}
