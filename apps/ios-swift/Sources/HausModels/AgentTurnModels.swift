import Foundation

public enum AgentTurnOperationCategory: String, Codable, CaseIterable, Hashable, Sendable {
    case browsing
    case checkingMessages = "checking_messages"
    case delegating
    case editingFiles = "editing_files"
    case generatingImage = "generating_image"
    case generatingVideo = "generating_video"
    case readingFiles = "reading_files"
    case runningCommand = "running_command"
    case searchingWeb = "searching_web"
    case updatingInstructions = "updating_instructions"
    case usingTool = "using_tool"
}

public struct AgentTurnOperationCount: Decodable, Hashable, Sendable {
    public let category: AgentTurnOperationCategory
    public let completed: Int
    public let failed: Int
    public let interrupted: Int
}

public struct AgentTurnActivitySummary: Decodable, Hashable, Sendable {
    public let operations: [AgentTurnOperationCount]
}

public enum AgentTurnStatus: String, Codable, Hashable, Sendable {
    case completed, failed, interrupted
}

public struct AgentTurn: Decodable, Identifiable, Hashable, Sendable {
    public let activity: AgentTurnActivitySummary
    public let agentID: String
    public let endedAt: Date
    public let failureKind: String?
    public let messageCount: Int
    public let outputProduced: Bool
    public let runID: String
    public let startedAt: Date
    public let status: AgentTurnStatus
    public let summary: String?
    public let trigger: AgentTurnTrigger?

    public var id: String { runID }

    enum CodingKeys: String, CodingKey {
        case activity, endedAt, failureKind, messageCount, outputProduced, startedAt, status, summary, trigger
        case agentID = "agentId"
        case runID = "runId"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        activity = try container.decode(AgentTurnActivitySummary.self, forKey: .activity)
        agentID = try container.decode(String.self, forKey: .agentID)
        endedAt = try container.decode(Date.self, forKey: .endedAt)
        failureKind = try container.decode(String?.self, forKey: .failureKind)
        messageCount = try container.decode(Int.self, forKey: .messageCount)
        outputProduced = try container.decode(Bool.self, forKey: .outputProduced)
        runID = try container.decode(String.self, forKey: .runID)
        startedAt = try container.decode(Date.self, forKey: .startedAt)
        status = try container.decode(AgentTurnStatus.self, forKey: .status)
        summary = try container.decode(String?.self, forKey: .summary)
        trigger = try container.decode(AgentTurnTrigger?.self, forKey: .trigger)
    }
}

public struct AgentTarget: Encodable, Equatable, Sendable {
    public let agentID: String
    public let serverID: String

    public init(agentID: String, serverID: String) {
        self.agentID = agentID
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case agentID = "agentId"
        case serverID = "serverId"
    }
}

public struct AgentTurnsInput: Encodable, Equatable, Sendable {
    public static let limitRange = 1...50

    public let agentID: String
    public let serverID: String
    public let limit: Int
    public let runID: String?

    public init?(agentID: String, serverID: String, limit: Int = 10, runID: String? = nil) {
        guard Self.limitRange.contains(limit) else { return nil }
        self.agentID = agentID
        self.serverID = serverID
        self.limit = limit
        self.runID = runID
    }

    enum CodingKeys: String, CodingKey {
        case agentID = "agentId"
        case serverID = "serverId"
        case limit
        case runID = "runId"
    }
}
