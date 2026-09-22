import Foundation

public struct AgentRuntimeConfiguration: Codable, Equatable, Hashable, Sendable {
    public let modelID: String
    public let reasoningEffort: AgentReasoningEffort
    public let runtimeID: String

    public init(modelID: String, reasoningEffort: AgentReasoningEffort, runtimeID: String) {
        self.modelID = modelID
        self.reasoningEffort = reasoningEffort
        self.runtimeID = runtimeID
    }
}

public func isAgentRuntimeConfigurationAvailable(
    _ configuration: AgentRuntimeConfiguration,
    in runtimes: [ComputerRuntimeSummary]
) -> Bool {
    guard let runtime = runtimes.first(where: { $0.id == configuration.runtimeID }),
          let model = runtime.models.first(where: { $0.id == configuration.modelID }) else {
        return false
    }
    return modelReasoningEfforts(model).contains(configuration.reasoningEffort)
}
