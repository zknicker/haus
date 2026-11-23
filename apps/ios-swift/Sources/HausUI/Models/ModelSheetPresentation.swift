import Foundation
import HausModels

/// Everything the Model sheet shows: the Captain's current model, the models grouped by model
/// connection, and whether the viewer may change it.
public struct ModelSheetPresentation: Equatable, Sendable {
    public let captainName: String
    public let current: AgentRuntimeConfiguration?
    public let groups: [ModelSheetGroup]
    public let access: ModelSheetAccess

    public init(
        captainName: String,
        current: AgentRuntimeConfiguration?,
        groups: [ModelSheetGroup],
        access: ModelSheetAccess
    ) {
        self.captainName = captainName
        self.current = current
        self.groups = groups
        self.access = access
    }

    public var isConfigurable: Bool { access == .configurable }

    public var currentOption: ModelSheetOption? {
        guard let current else { return nil }
        return groups.lazy.flatMap(\.options).first { $0.matches(current) }
    }

    /// The composer chip's label: the current model's name, or its id when no connection lists it.
    public var chipTitle: String {
        currentOption?.model.label ?? current?.modelID ?? "Model"
    }

    public var chipProvider: ModelProvider? {
        guard let current else { return nil }
        return groups.first { group in group.options.contains { $0.matches(current) } }?.provider
    }

    public func isCurrent(_ option: ModelSheetOption) -> Bool {
        current.map(option.matches) ?? false
    }

    /// The effort the current row shows beside its checkmark. A model with no effort choice
    /// shows none.
    public func effortLabel(for option: ModelSheetOption) -> String? {
        guard let current, option.matches(current), option.offersEffortChoice else { return nil }
        return current.reasoningEffort.displayName
    }

    /// What picking a model or an effort writes. A bare model pick keeps the current effort when
    /// the new model supports it, and falls back to the model's default otherwise.
    public func configuration(
        selecting option: ModelSheetOption,
        effort: AgentReasoningEffort? = nil
    ) -> AgentRuntimeConfiguration {
        let preferred = effort ?? current?.reasoningEffort ?? option.model.defaultEffort
        let supported = option.model.supportedReasoningEfforts
        return AgentRuntimeConfiguration(
            modelID: option.model.id,
            reasoningEffort: supported.contains(preferred) ? preferred : option.model.defaultEffort,
            runtimeID: option.runtimeID
        )
    }

    /// Groups whose title or models match the query. A group title match keeps all its models.
    public func groups(matching query: String) -> [ModelSheetGroup] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return groups }
        return groups.compactMap { group in
            if group.title.localizedCaseInsensitiveContains(needle) { return group }
            let options = group.options.filter {
                $0.model.label.localizedCaseInsensitiveContains(needle)
                    || $0.model.id.localizedCaseInsensitiveContains(needle)
            }
            return options.isEmpty ? nil : group.replacingOptions(options)
        }
    }

    /// The line under the list: why the viewer cannot change the model, or what changing it does.
    public var footer: String {
        switch access {
        case .configurable:
            "Changes \(captainName)’s model everywhere and starts a fresh session."
        case .viewerCannotConfigure:
            "Only Owners and Admins can change \(captainName)’s model."
        case .configureRefused(let reason):
            reason ?? "Haus couldn’t change \(captainName)’s model."
        }
    }
}

/// Whether the viewer can change the Captain's model from the sheet.
public enum ModelSheetAccess: Equatable, Sendable {
    case configurable
    case viewerCannotConfigure
    /// The Server refused `agent.configure`; the reason is its message when it gave one.
    case configureRefused(String?)
}

/// One model connection and the models it runs.
public struct ModelSheetGroup: Identifiable, Equatable, Sendable {
    public let id: String
    public let provider: ModelProvider
    public let label: String
    public let capacity: [ModelCapacityWindow]
    public let options: [ModelSheetOption]

    public init(
        id: String,
        provider: ModelProvider,
        label: String,
        capacity: [ModelCapacityWindow],
        options: [ModelSheetOption]
    ) {
        self.id = id
        self.provider = provider
        self.label = label
        self.capacity = capacity
        self.options = options
    }

    public init(connection: ModelConnection, options: [ModelSheetOption]) {
        self.init(
            id: connection.id,
            provider: connection.provider,
            label: connection.label,
            capacity: (connection.capacity ?? []).map(ModelCapacityWindow.init),
            options: options
        )
    }

    /// "Claude · Zach's Max".
    public var title: String { "\(provider.displayName) · \(label)" }

    /// "64% left", from the tightest capacity window.
    public var capacityLine: String? {
        ModelCapacityWindow.tightest(capacity).map { "\($0.percentLeft)% left" }
    }

    func replacingOptions(_ options: [ModelSheetOption]) -> ModelSheetGroup {
        ModelSheetGroup(id: id, provider: provider, label: label, capacity: capacity, options: options)
    }
}

/// One model a runtime offers through a connection.
public struct ModelSheetOption: Identifiable, Equatable, Sendable {
    public let runtimeID: String
    public let model: SettingsRuntimeModel

    public init(runtimeID: String, model: SettingsRuntimeModel) {
        self.runtimeID = runtimeID
        self.model = model
    }

    public var id: String { "\(runtimeID)/\(model.id)" }

    /// Whether the effort picker has more than one choice to offer.
    public var offersEffortChoice: Bool {
        model.supportedReasoningEfforts.filter { $0 != .default }.count > 1
    }

    func matches(_ configuration: AgentRuntimeConfiguration) -> Bool {
        configuration.runtimeID == runtimeID && configuration.modelID == model.id
    }
}

public extension ModelProvider {
    var displayName: String {
        switch self {
        case .claude: "Claude"
        case .chatgpt: "ChatGPT"
        case .xai: "xAI"
        case .gemini: "Gemini"
        case .openrouter: "OpenRouter"
        }
    }
}
