import Foundation

/// The human-chosen Cloud Agent model for one Server. `auto` sends no model and
/// lets Cursor pick; `model` names one id from Cursor's catalog.
public enum CloudAgentModelSetting: Hashable, Sendable {
    case auto
    case model(id: String)

    public var modelID: String? {
        guard case .model(let id) = self else { return nil }
        return id
    }
}

extension CloudAgentModelSetting: Codable {
    private enum CodingKeys: String, CodingKey { case id, kind }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .kind) {
        case "auto":
            self = .auto
        case "model":
            self = .model(id: try container.decode(String.self, forKey: .id))
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .kind,
                in: container,
                debugDescription: "Unknown Cloud Agent model setting kind."
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .auto:
            try container.encode("auto", forKey: .kind)
        case .model(let id):
            try container.encode("model", forKey: .kind)
            try container.encode(id, forKey: .id)
        }
    }
}

/// One model the Computer's Cursor account can run, verbatim from Cursor's
/// catalog. Cursor publishes no price or tier, so Haus carries none.
public struct CloudAgentModel: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let displayName: String
    public let description: String?

    public init(id: String, displayName: String, description: String? = nil) {
        self.id = id
        self.displayName = displayName
        self.description = description
    }
}

public struct CloudAgentModelCatalog: Codable, Hashable, Sendable {
    public let models: [CloudAgentModel]
    public let refreshedAt: Date

    public init(models: [CloudAgentModel], refreshedAt: Date) {
        self.models = models
        self.refreshedAt = refreshedAt
    }
}

/// `cloudAgentSettings.get`: the saved choice and the freshest catalog any of
/// the Server's Computers reported, or nil when none has.
public struct CloudAgentSettings: Codable, Hashable, Sendable {
    public let model: CloudAgentModelSetting
    public let catalog: CloudAgentModelCatalog?
    public let savedModelUnavailable: Bool

    public init(model: CloudAgentModelSetting, catalog: CloudAgentModelCatalog?, savedModelUnavailable: Bool) {
        self.model = model
        self.catalog = catalog
        self.savedModelUnavailable = savedModelUnavailable
    }
}

/// The model one Run asked Cursor for. `id` nil means Cursor default; `fallbackFrom`
/// names a saved model the launching Computer's catalog did not list.
public struct CloudAgentRunModel: Codable, Hashable, Sendable {
    public let id: String?
    public let fallbackFrom: String?

    public init(id: String?, fallbackFrom: String?) {
        self.id = id
        self.fallbackFrom = fallbackFrom
    }
}
