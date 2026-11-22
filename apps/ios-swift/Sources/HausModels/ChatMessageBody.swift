import Foundation

public enum ChatMessageBody: Codable, Sendable, Equatable {
    case text
    case agentCreated(CreatedAgentSummary)
    /// A Worker turn's report its delegating Captain posted in the Task chat.
    case workerReport(workerID: String, turnID: String, outcome: WorkerReportOutcome)
    case unsupported(String)

    private enum CodingKeys: String, CodingKey {
        case agent, kind, outcome
        case turnID = "turnId"
        case workerID = "workerId"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try container.decode(String.self, forKey: .kind)
        switch kind {
        case "text": self = .text
        case "agent-created":
            self = .agentCreated(try container.decode(CreatedAgentSummary.self, forKey: .agent))
        case "worker-report":
            self = .workerReport(
                workerID: try container.decode(String.self, forKey: .workerID),
                turnID: try container.decode(String.self, forKey: .turnID),
                outcome: try container.decode(WorkerReportOutcome.self, forKey: .outcome)
            )
        default: self = .unsupported(kind)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .text: try container.encode("text", forKey: .kind)
        case .agentCreated(let agent):
            try container.encode("agent-created", forKey: .kind)
            try container.encode(agent, forKey: .agent)
        case .workerReport(let workerID, let turnID, let outcome):
            try container.encode("worker-report", forKey: .kind)
            try container.encode(workerID, forKey: .workerID)
            try container.encode(turnID, forKey: .turnID)
            try container.encode(outcome, forKey: .outcome)
        case .unsupported(let kind): try container.encode(kind, forKey: .kind)
        }
    }
}
