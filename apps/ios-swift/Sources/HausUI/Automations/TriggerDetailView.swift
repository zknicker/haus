import HausModels
import SwiftUI

/// One Trigger, read-only: its state, what it asks the Agent to do, where it
/// came from, and what has reached it. Editing, the secret, test fires, and
/// deletion stay in the desktop and web App, which the footer says by name.
struct TriggerDetailView: View {
    let model: AgentAutomationsModel
    let triggerID: String
    let onOpenChat: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var fires: [TriggerFire]?
    @State private var firesFailed = false

    var body: some View {
        Group {
            if let trigger = model.trigger(id: triggerID) {
                content(trigger)
            } else {
                Color.clear.onAppear { dismiss() }
            }
        }
        .background(HausPlatformColor.groupedBackground)
        .navigationTitle("Trigger")
        .hausInlineNavigationTitle()
    }

    private func content(_ trigger: Trigger) -> some View {
        TimelineView(.everyMinute) { timeline in
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    AutomationDetailHeader(title: trigger.title, kindLabel: kindLabel(trigger))
                    SettingsSection(
                        "Trigger",
                        footer: "Edit, test, rotate the secret of, or delete this trigger in Haus on your computer."
                    ) {
                        SettingsListGroup {
                            AutomationFactRow(title: "Status", value: trigger.status == .armed ? "Active" : "Disabled")
                            AutomationFactRow(
                                title: "Created by",
                                value: AutomationFormatting.triggerCreator(
                                    handle: trigger.createdByHandle, ownerName: model.agentName
                                )
                            )
                            AutomationFactRow(
                                title: "Activity",
                                value: AutomationFormatting.triggerActivity(
                                    fireCount: trigger.fireCount, lastFiredAt: trigger.lastFiredAt, now: timeline.date
                                ),
                                showsDivider: false
                            )
                        }
                    }
                    if let instruction = trigger.instruction {
                        AutomationTextSection(title: "Instruction", text: instruction)
                    }
                    SettingsSection("Context") {
                        SettingsListGroup {
                            AutomationChatRow(label: model.actions.chatLabels[trigger.anchorChatID]) {
                                onOpenChat(trigger.anchorChatID)
                            }
                            AutomationFactRow(
                                title: "Created",
                                value: AutomationFormatting.timestamp(trigger.createdAt),
                                showsDivider: false
                            )
                        }
                    }
                    AutomationHistorySection(
                        title: "Fire history",
                        entries: fires,
                        failed: firesFailed,
                        emptyText: "Nothing has fired this trigger yet."
                    ) { fire in
                        (AutomationFormatting.timestamp(fire.receivedAt), AutomationFormatting.triggerFireDetail(fire))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .padding(.bottom, 28)
            }
            .scrollIndicators(.hidden)
        }
        .task(id: trigger.fireCount) { await loadFires(trigger) }
    }

    private func kindLabel(_ trigger: Trigger) -> String {
        trigger.kind == "webhook" ? "Webhook trigger" : "Trigger"
    }

    private func loadFires(_ trigger: Trigger) async {
        do {
            fires = try await model.actions.loadTriggerRuns(trigger.id)
            firesFailed = false
        } catch {
            firesFailed = fires == nil
        }
    }
}
