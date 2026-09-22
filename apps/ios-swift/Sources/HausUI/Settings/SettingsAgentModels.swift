import Foundation
import HausModels

public struct SettingsRuntimeModel: Identifiable, Hashable, Sendable {
    public let id: String
    public let label: String
    public let defaultReasoningEffort: AgentReasoningEffort?
    public let reasoningEfforts: [AgentReasoningEffort]?

    public init(
        id: String,
        label: String,
        defaultReasoningEffort: AgentReasoningEffort? = nil,
        reasoningEfforts: [AgentReasoningEffort]? = nil
    ) {
        self.id = id
        self.label = label
        self.defaultReasoningEffort = defaultReasoningEffort
        self.reasoningEfforts = reasoningEfforts
    }

    public init(_ model: ComputerModelSummary) {
        self.init(
            id: model.id,
            label: model.label,
            defaultReasoningEffort: model.defaultReasoningEffort,
            reasoningEfforts: model.reasoningEfforts
        )
    }

    public var supportedReasoningEfforts: [AgentReasoningEffort] {
        modelReasoningEfforts(computerModel)
    }

    public var defaultEffort: AgentReasoningEffort {
        modelDefaultReasoningEffort(computerModel)
    }

    private var computerModel: ComputerModelSummary {
        ComputerModelSummary(
            id: id,
            label: label,
            defaultReasoningEffort: defaultReasoningEffort,
            reasoningEfforts: reasoningEfforts
        )
    }
}

public struct SettingsRuntime: Identifiable, Hashable, Sendable {
    public let id: String
    public let label: String
    public let models: [SettingsRuntimeModel]

    public init(id: String, label: String, models: [SettingsRuntimeModel]) {
        self.id = id
        self.label = label
        self.models = models
    }

    public init(_ runtime: ComputerRuntimeSummary) {
        self.init(
            id: runtime.id,
            label: runtime.label,
            models: runtime.models.map(SettingsRuntimeModel.init)
        )
    }

    fileprivate var computerRuntime: ComputerRuntimeSummary {
        ComputerRuntimeSummary(
            id: id,
            label: label,
            models: models.map { model in
                ComputerModelSummary(
                    id: model.id,
                    label: model.label,
                    defaultReasoningEffort: model.defaultReasoningEffort,
                    reasoningEfforts: model.reasoningEfforts
                )
            }
        )
    }
}

public struct SettingsAgentRuntimeConfiguration: Hashable, Sendable {
    public let desired: AgentRuntimeConfiguration
    public let effective: AgentRuntimeConfiguration?
    public let runtimes: [SettingsRuntime]
    public let computerHealth: ComputerHealth?
    public let status: AgentStatus
    public let canEdit: Bool

    public init(
        desired: AgentRuntimeConfiguration,
        effective: AgentRuntimeConfiguration?,
        runtimes: [SettingsRuntime],
        computerHealth: ComputerHealth?,
        status: AgentStatus,
        canEdit: Bool
    ) {
        self.desired = desired
        self.effective = effective
        self.runtimes = runtimes
        self.computerHealth = computerHealth
        self.status = status
        self.canEdit = canEdit
    }

    public var desiredRuntime: SettingsRuntime? {
        runtimes.first { $0.id == desired.runtimeID }
    }

    public var desiredModel: SettingsRuntimeModel? {
        desiredRuntime?.models.first { $0.id == desired.modelID }
    }

    public var isDesiredConfigurationAvailable: Bool {
        isAvailable(desired)
    }

    public func isAvailable(_ configuration: AgentRuntimeConfiguration) -> Bool {
        isAgentRuntimeConfigurationAvailable(
            configuration,
            in: runtimes.map(\.computerRuntime)
        )
    }

    public var desiredRuntimeLabel: String {
        desiredRuntime?.label ?? settingsRuntimeDisplayName(desired.runtimeID)
    }

    public var desiredModelLabel: String {
        desiredModel?.label ?? desired.modelID
    }

    public var summary: String {
        "\(desiredRuntimeLabel) · \(desiredModelLabel) · \(desired.reasoningEffort.displayName)"
    }

    public var statusLabel: String {
        if status == .applied { return "Current" }
        if status == .degraded { return "Needs attention" }
        if computerHealth == .offline { return "Applies when Computer reconnects" }
        if computerHealth == .updateRequired { return "Waiting for Computer update" }
        return "Applying on next turn"
    }
}
