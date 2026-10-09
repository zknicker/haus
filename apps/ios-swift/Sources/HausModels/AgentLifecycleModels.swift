import Foundation

public enum AgentLifecyclePhase: String, Codable, Sendable {
    case working
    case reading
    case sending
    case settled
}

public enum AgentLifecycleOutcome: String, Codable, Sendable {
    case completed
    case failed
    case stopped
}

/// Volatile Agent execution projection. `compositionID`, `text`, and
/// `outcome` are present only for their corresponding phases on the wire.
public struct AgentLifecycleEvent: Codable, Identifiable, Sendable, Equatable {
    public let agentID: String
    public let chatID: String
    public let emittedAt: Date
    public let runID: String
    public let serverID: String
    public let phase: AgentLifecyclePhase
    public let compositionID: String?
    public let text: String?
    public let outcome: AgentLifecycleOutcome?

    enum CodingKeys: String, CodingKey {
        case agentID = "agentId"
        case chatID = "chatId"
        case emittedAt
        case runID = "runId"
        case serverID = "serverId"
        case phase
        case compositionID = "compositionId"
        case text
        case outcome
    }

    public var id: String { "\(runID):\(phase.rawValue):\(emittedAt.timeIntervalSince1970)" }

    public init(
        agentID: String,
        chatID: String,
        emittedAt: Date,
        runID: String,
        serverID: String,
        phase: AgentLifecyclePhase,
        compositionID: String? = nil,
        text: String? = nil,
        outcome: AgentLifecycleOutcome? = nil
    ) {
        self.agentID = agentID
        self.chatID = chatID
        self.emittedAt = emittedAt
        self.runID = runID
        self.serverID = serverID
        self.phase = phase
        self.compositionID = compositionID
        self.text = text
        self.outcome = outcome
    }
}
