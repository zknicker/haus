import Foundation

/// Server-defined activity categories. Decoding tolerates values this build
/// does not know yet: new categories ship on the Server independent of client
/// releases, and one unknown row must not fail a whole activity page.
public enum AgentActivityCategory: Codable, Sendable, Hashable {
    case startingWork
    case checkingMessages
    case receivedMessage
    case thinking
    case updatingInstructions
    case browsing
    case searchingWeb
    case readingFiles
    case editingFiles
    case runningCommand
    case usingTool
    case delegating
    case sendingMessage
    case working
    case unknown(String)

    private init(wireValue: String) {
        switch wireValue {
        case "starting_work": self = .startingWork
        case "checking_messages": self = .checkingMessages
        case "received_message": self = .receivedMessage
        case "thinking": self = .thinking
        case "updating_instructions": self = .updatingInstructions
        case "browsing": self = .browsing
        case "searching_web": self = .searchingWeb
        case "reading_files": self = .readingFiles
        case "editing_files": self = .editingFiles
        case "running_command": self = .runningCommand
        case "using_tool": self = .usingTool
        case "delegating": self = .delegating
        case "sending_message": self = .sendingMessage
        case "working": self = .working
        default: self = .unknown(wireValue)
        }
    }

    private var wireValue: String {
        switch self {
        case .startingWork: "starting_work"
        case .checkingMessages: "checking_messages"
        case .receivedMessage: "received_message"
        case .thinking: "thinking"
        case .updatingInstructions: "updating_instructions"
        case .browsing: "browsing"
        case .searchingWeb: "searching_web"
        case .readingFiles: "reading_files"
        case .editingFiles: "editing_files"
        case .runningCommand: "running_command"
        case .usingTool: "using_tool"
        case .delegating: "delegating"
        case .sendingMessage: "sending_message"
        case .working: "working"
        case .unknown(let raw): raw
        }
    }

    public init(from decoder: Decoder) throws {
        self.init(wireValue: try decoder.singleValueContainer().decode(String.self))
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(wireValue)
    }
}

public enum AgentActivityPhase: String, Codable, Sendable {
    case started
    case completed
    case failed
    case interrupted
}

public enum AgentActivityProducer: String, Codable, Sendable {
    case server
    case computer
}

/// Server-persisted semantic work evidence. Raw tool arguments and results
/// remain Computer-local and never cross this boundary.
public struct AgentActivityEvent: Codable, Identifiable, Sendable, Equatable {
    public let agentID: String
    public let category: AgentActivityCategory
    public let id: String
    public let occurredAt: Date
    public let phase: AgentActivityPhase
    public let position: Int
    public let producer: AgentActivityProducer
    public let producerID: String
    public let producerSequence: Int
    public let runID: String
    public let serverID: String
    public let toolRef: String?

    enum CodingKeys: String, CodingKey {
        case agentID = "agentId"
        case category
        case id
        case occurredAt
        case phase
        case position
        case producer
        case producerID = "producerId"
        case producerSequence
        case runID = "runId"
        case serverID = "serverId"
        case toolRef
    }

    public init(
        agentID: String,
        category: AgentActivityCategory,
        id: String,
        occurredAt: Date,
        phase: AgentActivityPhase,
        position: Int,
        producer: AgentActivityProducer,
        producerID: String,
        producerSequence: Int,
        runID: String,
        serverID: String,
        toolRef: String? = nil
    ) {
        self.agentID = agentID
        self.category = category
        self.id = id
        self.occurredAt = occurredAt
        self.phase = phase
        self.position = position
        self.producer = producer
        self.producerID = producerID
        self.producerSequence = producerSequence
        self.runID = runID
        self.serverID = serverID
        self.toolRef = toolRef
    }

    public var isTerminal: Bool {
        producer == .server && category == .working && phase != .started
    }

    public var isFinishing: Bool {
        producer == .server && category == .sendingMessage && phase == .completed
    }

    public func projectedAsWorking() -> AgentActivityEvent {
        AgentActivityEvent(
            agentID: agentID,
            category: .working,
            id: id,
            occurredAt: occurredAt,
            phase: .started,
            position: position,
            producer: producer,
            producerID: producerID,
            producerSequence: producerSequence,
            runID: runID,
            serverID: serverID,
            toolRef: toolRef
        )
    }
}

public struct AgentActiveActivitySnapshot: Codable, Sendable, Equatable {
    public let activities: [AgentActivityEvent]
}

public struct AgentActivityCursor: Codable, Sendable, Equatable {
    public let position: Int
    public let runID: String

    enum CodingKeys: String, CodingKey {
        case position
        case runID = "runId"
    }
}

public struct AgentActivityHistoryPage: Codable, Sendable, Equatable {
    public let events: [AgentActivityEvent]
    public let nextBefore: AgentActivityCursor?
}

public struct AgentActivityHistoryInput: Encodable, Sendable {
    public let agentId: String
    public let limit: Int
    public let serverId: String

    public init(agentId: String, limit: Int = 30, serverId: String) {
        self.agentId = agentId
        self.limit = limit
        self.serverId = serverId
    }
}
