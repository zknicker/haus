import SwiftUI

struct AgentExecutionSettingsSection: View {
    let agent: SettingsAgent
    let onOpenRuntimeConfiguration: () -> Void

    var body: some View {
        SettingsSection("Execution") {
            SettingsListGroup {
                if let configuration = agent.runtimeConfiguration {
                    if configuration.canEdit {
                        DisclosureRow(
                            "Runtime & model",
                            subtitle: configuration.summary,
                            icon: .terminal,
                            action: onOpenRuntimeConfiguration
                        )
                    } else {
                        ValueRow("Runtime", value: agent.runtime, icon: .terminal)
                        ValueRow("Model", value: agent.model, icon: .agents)
                    }
                    ValueRow("Status", value: configuration.statusLabel, icon: .settings, showsDivider: false)
                } else {
                    ValueRow("Runtime", value: agent.runtime, icon: .terminal)
                    ValueRow("Model", value: agent.model, icon: .agents)
                    ValueRow("Status", value: agent.status, icon: .settings, showsDivider: false)
                }
            }
        }
    }
}
