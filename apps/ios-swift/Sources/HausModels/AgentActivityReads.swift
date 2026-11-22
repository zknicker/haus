import Foundation

public struct AgentActiveDelegation: Decodable, Hashable, Sendable {
    public let operationID: String
    public let startedAt: Date

    enum CodingKeys: String, CodingKey {
        case operationID = "operationId"
        case startedAt
    }
}

public struct AgentCurrentActivity: Decodable, Sendable, Equatable {
    public let event: AgentActivityEvent
    public let runStartedAt: Date?
    public let activeDelegations: [AgentActiveDelegation]

    public init(event: AgentActivityEvent, runStartedAt: Date?, activeDelegations: [AgentActiveDelegation] = []) {
        self.event = event
        self.runStartedAt = runStartedAt
        self.activeDelegations = activeDelegations
    }

    enum CodingKeys: String, CodingKey {
        case activeDelegations
        case runStartedAt
    }

    public init(from decoder: Decoder) throws {
        event = try AgentActivityEvent(from: decoder)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        runStartedAt = try container.decode(Date?.self, forKey: .runStartedAt)
        activeDelegations = try container.decodeIfPresent([AgentActiveDelegation].self, forKey: .activeDelegations) ?? []
    }
}

public struct AgentActiveActivitySnapshot: Decodable, Sendable, Equatable {
    public let current: [AgentCurrentActivity]

    public var activities: [AgentActivityEvent] { current.map(\.event) }

    public init(current: [AgentCurrentActivity]) {
        self.current = current
    }

    enum CodingKeys: String, CodingKey {
        case current = "activities"
    }
}

public struct AgentActivityCursor: Codable, Sendable, Equatable {
    public let position: Int
    public let runID: String

    public init(position: Int, runID: String) {
        self.position = position
        self.runID = runID
    }

    enum CodingKeys: String, CodingKey {
        case position
        case runID = "runId"
    }
}

public struct AgentActivityHistoryPage: Decodable, Sendable, Equatable {
    public let events: [AgentActivityEvent]
    public let nextBefore: AgentActivityCursor?
    public let runTriggers: [AgentRunTriggerEntry]

    enum CodingKeys: String, CodingKey {
        case events, nextBefore, runTriggers
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        events = try container.decode([AgentActivityEvent].self, forKey: .events)
        nextBefore = try container.decode(AgentActivityCursor?.self, forKey: .nextBefore)
        runTriggers = try container.decode([AgentRunTriggerEntry].self, forKey: .runTriggers)
    }
}

public struct AgentActivityHistoryInput: Encodable, Sendable, Equatable {
    public static let limitRange = 1...100

    public let agentId: String
    public let limit: Int
    public let serverId: String
    public let before: AgentActivityCursor?
    public let runId: String?

    public init(agentId: String, limit: Int = 30, serverId: String) {
        self.agentId = agentId
        self.limit = limit
        self.serverId = serverId
        before = nil
        runId = nil
    }

    public init?(agentId: String, limit: Int = 30, serverId: String, before: AgentActivityCursor?, runId: String?) {
        guard Self.limitRange.contains(limit) else { return nil }
        if let before, let runId, before.runID != runId { return nil }
        self.agentId = agentId
        self.limit = limit
        self.serverId = serverId
        self.before = before
        self.runId = runId
    }
}
