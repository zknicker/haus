import Foundation

/// The parameters a human chose for one model. A nil field means the model's
/// own default, and Haus never sends it.
public struct CloudAgentModelParams: Codable, Hashable, Sendable {
    public var effort: String?
    public var fast: Bool?

    public init(effort: String? = nil, fast: Bool? = nil) {
        self.effort = effort
        self.fast = fast
    }

    public static let modelDefaults = Self()
}

/// The human-chosen Cloud Agent model for one Server. `auto` is Cursor's Auto,
/// which picks a model for each run; `model` names one id from Cursor's catalog and its params.
public enum CloudAgentModelSetting: Hashable, Sendable {
    case auto
    case model(id: String, params: CloudAgentModelParams)

    public var modelID: String? {
        guard case .model(let id, _) = self else { return nil }
        return id
    }

    public var params: CloudAgentModelParams {
        guard case .model(_, let params) = self else { return .modelDefaults }
        return params
    }
}

extension CloudAgentModelSetting: Codable {
    private enum CodingKeys: String, CodingKey { case id, kind, params }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .kind) {
        case "auto":
            self = .auto
        case "model":
            self = .model(
                id: try container.decode(String.self, forKey: .id),
                params: try container.decode(CloudAgentModelParams.self, forKey: .params)
            )
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .kind,
                in: container,
                debugDescription: "Unknown Cloud Agent model setting kind."
            )
        }
    }

    /// `params` is required on the wire: `{}` when every param is the model default.
    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .auto:
            try container.encode("auto", forKey: .kind)
        case .model(let id, let params):
            try container.encode("model", forKey: .kind)
            try container.encode(id, forKey: .id)
            try container.encode(params, forKey: .params)
        }
    }
}

/// The family a settings list groups a model under, derived by Computer from
/// the id and name. Codex models are GPT models.
public enum CloudAgentModelFamily: String, Codable, Hashable, Sendable {
    case claude, gpt, gemini, grok, composer, glm, kimi, other

    /// A family a newer Server adds reads as `other` rather than failing the catalog.
    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Self(rawValue: raw) ?? .other
    }
}

/// A model's effort control: options in Cursor's order and the value Cursor's
/// default variant uses, or nil when it names none.
public struct CloudAgentModelEffort: Codable, Hashable, Sendable {
    public struct Option: Codable, Hashable, Sendable {
        public let value: String
        public let displayName: String

        public init(value: String, displayName: String) {
            self.value = value
            self.displayName = displayName
        }
    }

    public let options: [Option]
    public let defaultValue: String?
    public let providerParamId: String

    public init(options: [Option], defaultValue: String?, providerParamId: String = "effort") {
        self.options = options
        self.defaultValue = defaultValue
        self.providerParamId = providerParamId
    }
}

/// Fast mode, offered as on or off; `defaultValue` is Cursor's default variant's choice.
public struct CloudAgentModelFast: Codable, Hashable, Sendable {
    public let defaultValue: Bool

    public init(defaultValue: Bool) {
        self.defaultValue = defaultValue
    }
}

/// One model the Computer's Cursor account can run, as Cursor lists it. Cursor
/// publishes no price or tier, so Haus carries none. `order` is the model's
/// position in Cursor's list; `effort` and `fast` are nil when not offered.
public struct CloudAgentModel: Codable, Hashable, Identifiable, Sendable {
    public let id: String
    public let displayName: String
    public let description: String?
    public let family: CloudAgentModelFamily
    public let order: Int
    public let effort: CloudAgentModelEffort?
    public let fast: CloudAgentModelFast?

    public init(
        id: String,
        displayName: String,
        description: String? = nil,
        family: CloudAgentModelFamily = .other,
        order: Int = 0,
        effort: CloudAgentModelEffort? = nil,
        fast: CloudAgentModelFast? = nil
    ) {
        self.id = id
        self.displayName = displayName
        self.description = description
        self.family = family
        self.order = order
        self.effort = effort
        self.fast = fast
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

/// The model one Run asked Cursor for. `id` is a catalog model, `default` for
/// Auto, or nil when none was sent (the catalog lacked Auto); `params`
/// are what was sent with it; `fallbackFrom` names a saved model the launching
/// Computer's catalog did not list; `droppedParams` names saved params the
/// model no longer offered, so the Run took its default.
public struct CloudAgentRunModel: Codable, Hashable, Sendable {
    public struct Param: Codable, Hashable, Sendable {
        public let name: String
        public let providerParamId: String
        public let value: String

        public init(name: String, providerParamId: String, value: String) {
            self.name = name
            self.providerParamId = providerParamId
            self.value = value
        }
    }

    public let id: String?
    public let params: [Param]
    public let fallbackFrom: String?
    public let droppedParams: [String]

    public init(id: String?, params: [Param] = [], fallbackFrom: String?, droppedParams: [String] = []) {
        self.id = id
        self.params = params
        self.fallbackFrom = fallbackFrom
        self.droppedParams = droppedParams
    }
}
