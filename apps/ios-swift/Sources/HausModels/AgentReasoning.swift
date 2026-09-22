import Foundation

public extension AgentReasoningEffort {
    var displayName: String {
        switch self {
        case .default:
            "Not configurable"
        case .low:
            "Low"
        case .medium:
            "Medium"
        case .high:
            "High"
        case .xhigh:
            "Extra high"
        case .max:
            "Max"
        }
    }
}

/// Computer protocol 23 reports model-specific choices. Older inventories
/// omitted the fields, so keep their original three-level contract here.
public func modelReasoningEfforts(_ model: ComputerModelSummary) -> [AgentReasoningEffort] {
    model.reasoningEfforts ?? [.low, .medium, .high]
}

public func modelDefaultReasoningEffort(_ model: ComputerModelSummary) -> AgentReasoningEffort {
    let efforts = modelReasoningEfforts(model)
    return model.defaultReasoningEffort
        ?? (efforts.contains(.medium) ? .medium : (efforts.first ?? .medium))
}

public func supportedReasoningEffort(
    for model: ComputerModelSummary?,
    preferred: AgentReasoningEffort
) -> AgentReasoningEffort {
    guard let model else { return preferred }
    let efforts = modelReasoningEfforts(model)
    return efforts.contains(preferred) ? preferred : modelDefaultReasoningEffort(model)
}

/// Grok Build carries its effort in the ACP resume identity, so its effort
/// change starts a fresh session even though the next turn keeps the setting.
public func reasoningChangeResetsSession(runtimeID: String) -> Bool {
    runtimeID == "grok-build"
}
