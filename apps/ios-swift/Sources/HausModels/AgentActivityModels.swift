import Foundation

public enum AgentActivityCategory: String, Codable, Sendable {
    case startingWork = "starting_work"
    case checkingMessages = "checking_messages"
    case receivedMessage = "received_message"
    case thinking
    case browsing
    case searchingWeb = "searching_web"
    case readingFiles = "reading_files"
    case editingFiles = "editing_files"
    case runningCommand = "running_command"
    case usingTool = "using_tool"
    case sendingMessage = "sending_message"
    case working
}

public enum AgentActivityPhase: String, Codable, Sendable {
    case started
    case completed
    case failed
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
