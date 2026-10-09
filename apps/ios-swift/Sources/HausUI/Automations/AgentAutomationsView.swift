import HausModels
import SwiftUI

/// An Agent's Automations: the Reminders still coming, then its Triggers —
/// the App's Automations tab in a phone shape. Authoring is the Agent's (and,
/// for Triggers, the desktop App's); the phone reads, and cancels a Reminder.
struct AgentAutomationsView: View {
    @State private var model: AgentAutomationsModel
    @State private var selection: AutomationSelection?
    /// The viewer's saved zone; every time on these screens reads in it.
    let viewerZone: TimeZone
    let onOpenChat: (String) -> Void

    init(
        agentID: String,
        agentName: String,
        actions: AgentAutomationsActions,
        viewerZone: TimeZone,
        onOpenChat: @escaping (String) -> Void
    ) {
        _model = State(initialValue: AgentAutomationsModel(agentID: agentID, agentName: agentName, actions: actions))
        self.viewerZone = viewerZone
        self.onOpenChat = onOpenChat
    }

    var body: some View {
        // One clock for the screen, so "Today" turns into "Yesterday" on time.
        TimelineView(.everyMinute) { timeline in
            let context = ReminderScheduleContext(now: timeline.date, viewerZone: viewerZone)
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    reminders(context)
                    triggers(now: timeline.date)
                }
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .padding(.bottom, 28)
            }
        }
        .scrollIndicators(.hidden)
        .background(HausPlatformColor.groupedBackground)
        .navigationTitle("Automations")
        .hausInlineNavigationTitle()
        .task { await model.load() }
        .refreshable { await model.load() }
        .navigationDestination(item: $selection) { selection in
            switch selection {
            case .reminder(let id):
                ReminderDetailView(model: model, reminderID: id, viewerZone: viewerZone, onOpenChat: onOpenChat)
            case .trigger(let id):
                TriggerDetailView(model: model, triggerID: id, viewerZone: viewerZone, onOpenChat: onOpenChat)
            }
        }
    }

    @ViewBuilder
    private func reminders(_ context: ReminderScheduleContext) -> some View {
        SettingsSection("Reminders") {
            if let scheduled = model.scheduled {
                SettingsListGroup {
                    if scheduled.isEmpty {
                        AutomationNote("Nothing scheduled. Just tell \(model.agentName) what to remember and when.")
                    }
                    ForEach(scheduled) { reminder in
                        AutomationRow(
                            kind: .reminder,
                            systemImage: reminder.kind == .once ? "calendar" : "repeat",
                            title: reminder.title,
                            summary: reminder.rowSummary(context),
                            showsDivider: reminder.id != scheduled.last?.id
                        ) { selection = .reminder(reminder.id) }
                    }
                }
            } else if model.remindersFailed {
                SettingsListGroup { AutomationNote("Unable to load reminders.") }
            }
        }
    }

    @ViewBuilder
    private func triggers(now: Date) -> some View {
        SettingsSection("Triggers") {
            if let triggers = model.triggers {
                SettingsListGroup {
                    if triggers.isEmpty {
                        AutomationNote("No triggers yet. Ask \(model.agentName) to wire one up.")
                    }
                    ForEach(triggers) { trigger in
                        AutomationRow(
                            kind: .trigger,
                            systemImage: "point.3.connected.trianglepath.dotted",
                            title: trigger.title,
                            summary: AutomationFormatting.triggerActivity(
                                fireCount: trigger.fireCount, lastFiredAt: trigger.lastFiredAt, now: now
                            ),
                            badge: AutomationFormatting.triggerRowStatus(trigger.status),
                            showsDivider: trigger.id != triggers.last?.id
                        ) { selection = .trigger(trigger.id) }
                    }
                }
            } else if model.triggersFailed {
                SettingsListGroup { AutomationNote("Unable to load triggers.") }
            }
        }
    }
}

enum AutomationSelection: Hashable, Identifiable {
    case reminder(String)
    case trigger(String)

    var id: Self { self }
}

/// A grouped list's quiet line: an empty or failed section.
struct AutomationNote: View {
    let text: String

    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
    }
}

#Preview("Automations") {
    NavigationStack {
        AgentAutomationsView(
            agentID: "agent-blippy",
            agentName: "Blippy",
            actions: .preview,
            viewerZone: HumanTimezone.viewerZone(saved: "America/New_York"),
            onOpenChat: { _ in }
        )
    }
}
