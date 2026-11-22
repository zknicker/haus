import Foundation

public enum ModelProvider: String, Codable, CaseIterable, Hashable, Sendable {
    case claude, chatgpt, xai, gemini, openrouter
}

public enum ModelConnectionAuthKind: String, Codable, Hashable, Sendable {
    case setupToken = "setup-token"
    case oauth
    case apiKey = "api-key"
}

public enum ModelConnectionStatus: String, Codable, Hashable, Sendable {
    case ready, failed
}

public struct ModelConnectionCapacityWindow: Decodable, Hashable, Sendable {
    public let id: String
    public let label: String
    public let resetsAt: Date?
    public let usedPercent: Double

    enum CodingKeys: String, CodingKey {
        case id, label, resetsAt, usedPercent
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        label = try container.decode(String.self, forKey: .label)
        resetsAt = try container.decode(Date?.self, forKey: .resetsAt)
        usedPercent = try container.decode(Double.self, forKey: .usedPercent)
    }
}

public struct ModelConnection: Decodable, Identifiable, Hashable, Sendable {
    public let authKind: ModelConnectionAuthKind
    public let capacity: [ModelConnectionCapacityWindow]?
    public let enabled: Bool
    public let id: String
    public let isDefault: Bool
    public let label: String
    public let position: Int
    public let provider: ModelProvider
    public let status: ModelConnectionStatus
    public let statusDetail: String?
    public let updatedAt: Date
    public let webSearch: Bool

    enum CodingKeys: String, CodingKey {
        case authKind, capacity, enabled, id, isDefault, label, position, provider, status, statusDetail
        case updatedAt, webSearch
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        authKind = try container.decode(ModelConnectionAuthKind.self, forKey: .authKind)
        capacity = try container.decode([ModelConnectionCapacityWindow]?.self, forKey: .capacity)
        enabled = try container.decode(Bool.self, forKey: .enabled)
        id = try container.decode(String.self, forKey: .id)
        isDefault = try container.decode(Bool.self, forKey: .isDefault)
        label = try container.decode(String.self, forKey: .label)
        position = try container.decode(Int.self, forKey: .position)
        provider = try container.decode(ModelProvider.self, forKey: .provider)
        status = try container.decode(ModelConnectionStatus.self, forKey: .status)
        statusDetail = try container.decode(String?.self, forKey: .statusDetail)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
        webSearch = try container.decode(Bool.self, forKey: .webSearch)
    }
}

public struct ModelConnectionsRead: Decodable, Sendable, Equatable {
    public let connections: [ModelConnection]
    public let runnerModels: [ComputerRuntimeSummary]?

    public init(connections: [ModelConnection], runnerModels: [ComputerRuntimeSummary]?) {
        self.connections = connections
        self.runnerModels = runnerModels
    }

    enum CodingKeys: String, CodingKey {
        case connections, runnerModels
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        connections = try container.decode([ModelConnection].self, forKey: .connections)
        runnerModels = try container.decode([ComputerRuntimeSummary]?.self, forKey: .runnerModels)
    }

    public var runtimeCatalog: [ComputerRuntimeSummary] { runnerModels ?? [] }
}

public struct ModelConnectionsUpdatedEvent: Decodable, Sendable, Equatable {
    public let serverID: String

    enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
    }
}

public enum ModelConnectionProcedures {
    public static let list = HausProcedure<ServerScopeInput, ModelConnectionsRead>.query("modelConnections.list")
}
