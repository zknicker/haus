import Foundation

/// Health reported by a Computer through the Server's `computer.list` query.
public enum ComputerHealth: String, Codable, Sendable, Equatable {
    case degraded
    case healthy
    case offline
    case updateRequired = "update-required"
}

/// Update phases returned in a Computer snapshot. Mobile settings only display
/// the Computer health; keeping the wire value here preserves the Server shape
/// for future read-only status details without inventing a second contract.
public enum ComputerUpdatePhase: String, Codable, Sendable, Equatable {
    case idle
    case checking
    case available
    case requested
    case downloading
    case verifying
    case installing
    case waitingForAgents = "waiting-for-agents"
    case restarting
    case complete
    case failed
}

public struct ComputerModelSummary: Codable, Sendable, Equatable {
    public let defaultReasoningEffort: AgentReasoningEffort?
    public let id: String
    public let label: String
    public let reasoningEfforts: [AgentReasoningEffort]?

    public init(
        id: String,
        label: String,
        defaultReasoningEffort: AgentReasoningEffort? = nil,
        reasoningEfforts: [AgentReasoningEffort]? = nil
    ) {
        self.defaultReasoningEffort = defaultReasoningEffort
        self.id = id
        self.label = label
        self.reasoningEfforts = reasoningEfforts
    }
}

public struct ComputerRuntimeSummary: Codable, Sendable, Equatable {
    public let id: String
    public let label: String
    public let models: [ComputerModelSummary]

    public init(id: String, label: String, models: [ComputerModelSummary]) {
        self.id = id
        self.label = label
        self.models = models
    }
}

/// Sanitized inventory reported by a Computer. The Server may add skill fields;
/// the native client only needs the stable name/runtime portion for this surface.
public struct ComputerReportedInventory: Codable, Sendable, Equatable {
    public let name: String?
    public let runtimes: [ComputerRuntimeSummary]
}

/// The complete read-only result shape returned by `computer.list`.
public struct ComputerSummary: Codable, Identifiable, Sendable, Equatable {
    public let architecture: String?
    public let createdAt: Date
    public let health: ComputerHealth
    public let id: String
    public let lastConnectedAt: Date?
    public let name: String?
    public let operatingSystem: String?
    public let productVersion: String?
    public let protocolVersion: Int?
    public let reportedInventory: ComputerReportedInventory?
    public let updateDetail: String?
    public let updateDownloadedBytes: Int?
    public let updateFailedPhase: ComputerUpdatePhase?
    public let updatePhase: ComputerUpdatePhase
    public let updateActiveAgentCount: Int?
    public let updateTargetVersion: String?
    public let updateTotalBytes: Int?
    public let updateUpdatedAt: Date?
}
