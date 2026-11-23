import Foundation

public struct ExecutionJournalFailure: Decodable, Hashable, Sendable {
    public let exitCode: Int?
    public let message: String
}

public struct ExecutionJournalResult: Decodable, Equatable, Sendable {
    public let error: JSONValue?
    public let observedAt: Date
    public let output: JSONValue?
}

public enum ExecutionJournalInterruptionReason: String, Decodable, Hashable, Sendable {
    case computerRestart = "computer_restart"
    case streamAbort = "stream_abort"
    case streamError = "stream_error"
}

public struct ExecutionJournalInterruption: Decodable, Hashable, Sendable {
    public let at: Date
    public let reason: ExecutionJournalInterruptionReason
}

public struct ExecutionJournalSubagentUsage: Decodable, Hashable, Sendable {
    public let durationMs: Int
    public let toolUses: Int
    public let totalTokens: Int
}

public struct ExecutionJournalSubagent: Decodable, Hashable, Sendable {
    public let backgrounded: Bool?
    public let endedAt: Date?
    public let failedToolCount: Int?
    public let label: String
    public let latestAction: String?
    public let startedAt: Date
    public let status: AgentExecutionStatus
    public let subagentType: String?
    public let usage: ExecutionJournalSubagentUsage?
}

public struct ExecutionJournalTool: Decodable, Identifiable, Equatable, Sendable {
    public let durationMs: Int?
    public let endedAt: Date?
    public let error: JSONValue?
    public let failure: ExecutionJournalFailure?
    public let finalResult: ExecutionJournalResult?
    public let input: JSONValue?
    public let interruptions: [ExecutionJournalInterruption]?
    public let nativeName: String?
    public let output: JSONValue?
    public let parentToolCallID: String?
    public let preliminary: ExecutionJournalResult?
    public let startedAt: Date
    public let status: AgentExecutionStatus
    public let subagent: ExecutionJournalSubagent?
    public let toolCallID: String
    public let toolName: String

    public var id: String { toolCallID }

    enum CodingKeys: String, CodingKey {
        case durationMs, endedAt, error, failure, input, interruptions, nativeName, output
        case finalResult = "final"
        case preliminary, startedAt, status, subagent, toolName
        case parentToolCallID = "parentToolCallId"
        case toolCallID = "toolCallId"
    }
}

public struct ExecutionJournalReasoning: Decodable, Identifiable, Hashable, Sendable {
    public let endedAt: Date?
    public let id: String
    public let startedAt: Date
    public let text: String
    public let truncated: Bool?
}

public struct AgentExecutionJournal: Decodable, Equatable, Sendable {
    public let endedAt: Date?
    public let error: JSONValue?
    public let failure: ExecutionJournalFailure?
    public let reasoning: [ExecutionJournalReasoning]?
    public let runID: String
    public let startedAt: Date
    public let status: AgentExecutionStatus
    public let tools: [ExecutionJournalTool]

    enum CodingKeys: String, CodingKey {
        case endedAt, error, failure, reasoning, startedAt, status, tools
        case runID = "runId"
    }
}

public enum AgentExecutionJournalResult: Decodable, Equatable, Sendable {
    case available(agentID: String, journal: AgentExecutionJournal)
    case missing(agentID: String, runID: String)

    enum CodingKeys: String, CodingKey {
        case journal, status
        case agentID = "agentId"
        case runID = "runId"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let agentID = try container.decode(String.self, forKey: .agentID)
        let runID = try container.decode(String.self, forKey: .runID)
        switch try container.decode(String.self, forKey: .status) {
        case "available":
            let journal = try container.decode(AgentExecutionJournal.self, forKey: .journal)
            guard journal.runID == runID else {
                throw DecodingError.dataCorruptedError(
                    forKey: .journal, in: container,
                    debugDescription: "The execution journal must belong to the requested run."
                )
            }
            self = .available(agentID: agentID, journal: journal)
        case "missing":
            self = .missing(agentID: agentID, runID: runID)
        case let status:
            throw DecodingError.dataCorruptedError(
                forKey: .status, in: container, debugDescription: "Unknown journal status \(status)."
            )
        }
    }
}

public struct AgentExecutionJournalChange: Decodable, Sendable, Equatable {
    public let agentID: String
    public let runID: String

    enum CodingKeys: String, CodingKey {
        case agentID = "agentId"
        case runID = "runId"
    }
}
