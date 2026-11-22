import HausModels
import SwiftUI

/// Every Captain's Automations in one place: a row per Captain with what it
/// has scheduled, opening that Captain's Reminders and Triggers.
struct AutomationsIndexView: View {
    let agents: [SettingsAgent]
    let actions: AgentAutomationsActions
    let onOpen: (String) -> Void

    @State private var counts: [String: AutomationCounts] = [:]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                SettingsSection(
                    nil,
                    footer: "Reminders and Triggers belong to the Captain that keeps them. Ask a Captain to add one."
                ) {
                    SettingsListGroup {
                        if agents.isEmpty {
                            AutomationNote("No Captains yet.")
                        }
                        ForEach(agents) { agent in
                            SettingsCaptainRow(
                                agent: agent,
                                value: counts[agent.id]?.label,
                                showsDivider: agent.id != agents.last?.id
                            ) { onOpen(agent.id) }
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(HausPlatformColor.canvas)
        .navigationTitle("Automations")
        .hausInlineNavigationTitle()
        .task(id: agents.map(\.id)) { await loadCounts() }
    }

    private func loadCounts() async {
        await withTaskGroup(of: (String, AutomationCounts?).self) { group in
            for agent in agents {
                group.addTask { [actions] in
                    (agent.id, await AutomationCounts.load(agentID: agent.id, actions: actions))
                }
            }
            for await (agentID, loaded) in group {
                counts[agentID] = loaded
            }
        }
    }
}

/// How many Reminders are still coming and how many Triggers a Captain has.
struct AutomationCounts: Equatable, Sendable {
    let reminders: Int
    let triggers: Int

    /// "2 reminders · 1 trigger", or "None".
    var label: String {
        let pieces = [
            reminders > 0 ? "\(reminders) \(reminders == 1 ? "reminder" : "reminders")" : nil,
            triggers > 0 ? "\(triggers) \(triggers == 1 ? "trigger" : "triggers")" : nil,
        ].compactMap { $0 }
        return pieces.isEmpty ? "None" : pieces.joined(separator: " · ")
    }

    /// Nil when either read fails: a partial count would read as the whole.
    static func load(agentID: String, actions: AgentAutomationsActions) async -> AutomationCounts? {
        async let reminders = try? actions.loadReminders(agentID)
        async let triggers = try? actions.loadTriggers(agentID)
        guard let reminders = await reminders, let triggers = await triggers else { return nil }
        return AutomationCounts(reminders: AutomationFormatting.scheduled(reminders).count, triggers: triggers.count)
    }
}

#Preview("Automations index") {
    NavigationStack {
        AutomationsIndexView(agents: [SettingsFixtures.blippy], actions: .preview, onOpen: { _ in })
    }
}
