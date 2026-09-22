import HausModels

/// Input for the Server's `agent.configure` procedure.
public struct ConfigureAgentInput: Encodable, Equatable, Sendable {
    public let agentID: String
    public let modelID: String
    public let reasoningEffort: AgentReasoningEffort
    public let runtimeID: String
    public let serverID: String

    public init(
        agentID: String,
        modelID: String,
        reasoningEffort: AgentReasoningEffort,
        runtimeID: String,
        serverID: String
    ) {
        self.agentID = agentID
        self.modelID = modelID
        self.reasoningEffort = reasoningEffort
        self.runtimeID = runtimeID
        self.serverID = serverID
    }

    private enum CodingKeys: String, CodingKey {
        case agentID = "agentId"
        case modelID = "modelId"
        case reasoningEffort
        case runtimeID = "runtimeId"
        case serverID = "serverId"
    }
}
