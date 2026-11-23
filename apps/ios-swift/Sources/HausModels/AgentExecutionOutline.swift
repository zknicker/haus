import Foundation

public enum AgentExecutionStatus: String, Codable, Hashable, Sendable {
    case completed, failed, interrupted, running
}

public enum ExecutionToolKind: String, Codable, CaseIterable, Hashable, Sendable {
    case compaction
    case fileChange = "file-change"
    case fileEdit = "file-edit"
    case fileRead = "file-read"
    case fileWrite = "file-write"
    case generic, image, mcp, message, search, shell, subagent, web
}

public enum AgentExecutionOutlineStepKind: String, Codable, Hashable, Sendable {
    case bookkeeping, reasoning, subagent, tool
}

public struct AgentExecutionOutlineSubagent: Decodable, Hashable, Sendable {
    public let failedToolCount: Int
    public let label: String
}

public struct AgentExecutionOutlineStep: Decodable, Identifiable, Hashable, Sendable {
    public let depth: Int
    public let durationMs: Int?
    public let id: String
    public let kind: AgentExecutionOutlineStepKind
    public let label: String
    public let parentID: String?
    public let startOffsetMs: Int
    public let status: AgentExecutionStatus
    public let subagent: AgentExecutionOutlineSubagent?
    public let toolKind: ExecutionToolKind?

    enum CodingKeys: String, CodingKey {
        case depth, durationMs, id, kind, label, startOffsetMs, status, subagent, toolKind
        case parentID = "parentId"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        depth = try container.decode(Int.self, forKey: .depth)
        durationMs = try container.decodeIfPresent(Int.self, forKey: .durationMs)
        id = try container.decode(String.self, forKey: .id)
        kind = try container.decode(AgentExecutionOutlineStepKind.self, forKey: .kind)
        label = try container.decode(String.self, forKey: .label)
        parentID = try container.decodeIfPresent(String.self, forKey: .parentID)
        startOffsetMs = try container.decode(Int.self, forKey: .startOffsetMs)
        status = try container.decode(AgentExecutionStatus.self, forKey: .status)
        subagent = try container.decodeIfPresent(AgentExecutionOutlineSubagent.self, forKey: .subagent)
        toolKind = try container.decodeIfPresent(ExecutionToolKind.self, forKey: .toolKind)
        guard (kind == .tool) == (toolKind != nil) else {
            throw DecodingError.dataCorruptedError(
                forKey: .toolKind, in: container, debugDescription: "Exactly the tool steps carry a toolKind."
            )
        }
    }
}

public struct AgentExecutionOutline: Decodable, Hashable, Sendable {
    public let durationMs: Int
    public let omittedSteps: Int?
    public let runID: String
    public let startedAt: Date
    public let status: AgentExecutionStatus
    public let steps: [AgentExecutionOutlineStep]

    enum CodingKeys: String, CodingKey {
        case durationMs, omittedSteps, startedAt, status, steps
        case runID = "runId"
    }
}

public enum AgentExecutionOutlineEntry: Decodable, Hashable, Sendable {
    case available(AgentExecutionOutline)
    case missing(runID: String)

    public var runID: String {
        switch self {
        case let .available(outline): outline.runID
        case let .missing(runID): runID
        }
    }

    enum CodingKeys: String, CodingKey {
        case outline, status
        case runID = "runId"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let runID = try container.decode(String.self, forKey: .runID)
        switch try container.decode(String.self, forKey: .status) {
        case "available":
            let outline = try container.decode(AgentExecutionOutline.self, forKey: .outline)
            guard outline.runID == runID else {
                throw DecodingError.dataCorruptedError(
                    forKey: .outline, in: container, debugDescription: "The execution outline must belong to its run."
                )
            }
            self = .available(outline)
        case "missing":
            self = .missing(runID: runID)
        case let status:
            throw DecodingError.dataCorruptedError(
                forKey: .status, in: container, debugDescription: "Unknown outline status \(status)."
            )
        }
    }
}

public struct AgentExecutionOutlines: Decodable, Hashable, Sendable {
    public let outlines: [AgentExecutionOutlineEntry]
}

public struct AgentExecutionOutlinesInput: Encodable, Equatable, Sendable {
    public static let maximumRuns = 50

    public let agentID: String
    public let runIDs: [String]
    public let serverID: String

    public init?(agentID: String, runIDs: [String], serverID: String) {
        guard (1...Self.maximumRuns).contains(runIDs.count), Set(runIDs).count == runIDs.count else { return nil }
        self.agentID = agentID
        self.runIDs = runIDs
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case agentID = "agentId"
        case runIDs = "runIds"
        case serverID = "serverId"
    }
}

public struct AgentRunTarget: Encodable, Equatable, Sendable {
    public let agentID: String
    public let runID: String
    public let serverID: String

    public init(agentID: String, runID: String, serverID: String) {
        self.agentID = agentID
        self.runID = runID
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case agentID = "agentId"
        case runID = "runId"
        case serverID = "serverId"
    }
}
