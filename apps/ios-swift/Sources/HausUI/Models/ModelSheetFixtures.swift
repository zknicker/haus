import Foundation
import HausModels
import SwiftUI

/// The mock's Model sheet: Blippy on Opus 5.5 at High, a Claude Max subscription, and an
/// OpenAI API key. Previews use it.
enum ModelSheetFixtures {
    static let efforts: [AgentReasoningEffort] = [.low, .medium, .high, .xhigh, .max]

    static let claude = ModelSheetGroup(
        id: "claude-max",
        provider: .claude,
        label: "Zach’s Max",
        capacity: [
            ModelCapacityWindow(
                id: "current-session",
                label: "5-hour",
                usedPercent: 18,
                resetsAt: Date(timeIntervalSinceNow: 3 * 3_600)
            ),
            ModelCapacityWindow(
                id: "current-week",
                label: "Weekly",
                usedPercent: 36,
                resetsAt: Date(timeIntervalSinceNow: 4 * 86_400)
            ),
        ],
        options: [
            option("claude-code", "claude-opus-5-5", "Opus 5.5"),
            option("claude-code", "claude-fable-5-2", "Fable 5.2"),
            option("claude-code", "claude-sonnet-5-5", "Sonnet 5.5"),
        ]
    )

    static let openAI = ModelSheetGroup(
        id: "openai-key",
        provider: .chatgpt,
        label: "API key",
        capacity: [],
        options: [option("codex", "gpt-6.2-sol", "GPT-6.2 Sol")]
    )

    static func presentation(access: ModelSheetAccess = .configurable) -> ModelSheetPresentation {
        ModelSheetPresentation(
            captainName: "Blippy",
            current: AgentRuntimeConfiguration(
                modelID: "claude-opus-5-5",
                reasoningEffort: .high,
                runtimeID: "claude-code"
            ),
            groups: [claude, openAI],
            access: access
        )
    }

    static func option(_ runtimeID: String, _ id: String, _ label: String) -> ModelSheetOption {
        ModelSheetOption(
            runtimeID: runtimeID,
            model: SettingsRuntimeModel(
                id: id,
                label: label,
                defaultReasoningEffort: .medium,
                reasoningEfforts: efforts
            )
        )
    }
}

#Preview("Model sheet") {
    ModelSheet(presentation: ModelSheetFixtures.presentation()) { _ in }
}

#Preview("Model sheet, Member") {
    ModelSheet(presentation: ModelSheetFixtures.presentation(access: .viewerCannotConfigure)) { _ in }
}

#Preview("Usage") {
    NavigationStack {
        ModelUsageView(groups: [ModelSheetFixtures.claude, ModelSheetFixtures.openAI])
    }
}
