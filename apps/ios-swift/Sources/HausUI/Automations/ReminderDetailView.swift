import HausModels
import SwiftUI

/// One Reminder: when it runs, what it will do, where it came from, and — for
/// a recurring one — how its past runs went. A scheduled one-time Reminder
/// has never run, so it carries no history to sit empty. It resolves its
/// record from the screen's list, so once the Reminder is canceled or fires
/// its one run, the screen pops.
struct ReminderDetailView: View {
    let model: AgentAutomationsModel
    let reminderID: String
    let onOpenChat: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var runs: [ReminderFire]?
    @State private var runsFailed = false
    @State private var isConfirming = false
    @State private var isCanceling = false
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if let reminder = model.reminder(id: reminderID) {
                content(reminder)
            } else {
                Color.clear.onAppear { dismiss() }
            }
        }
        .background(HausPlatformColor.groupedBackground)
        .navigationTitle("Reminder")
        .hausInlineNavigationTitle()
    }

    private func content(_ reminder: Reminder) -> some View {
        TimelineView(.everyMinute) { timeline in
            let schedule = reminder.scheduleDetail(ReminderScheduleContext(now: timeline.date))
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    AutomationDetailHeader(title: reminder.title, kindLabel: reminder.kind.label)
                    SettingsSection("Schedule") {
                        SettingsListGroup {
                            AutomationFactRow(title: reminder.kind == .once ? "Runs" : "Next run", value: schedule.nextRun)
                            AutomationFactRow(title: "Repeats", value: schedule.repeats)
                            AutomationFactRow(title: "Timezone", value: schedule.timezone, showsDivider: false)
                        }
                    }
                    if let instructions = reminder.instructions {
                        AutomationTextSection(title: "Instructions", text: instructions)
                    }
                    context(reminder)
                    if reminder.kind == .recurring {
                        AutomationHistorySection(
                            title: "Run history",
                            entries: runs,
                            failed: runsFailed,
                            emptyText: "This reminder hasn't run yet."
                        ) { run in
                            (
                                AutomationFormatting.timestamp(run.firedAt),
                                AutomationFormatting.runDelay(firedAt: run.firedAt, scheduledFor: run.scheduledFor)
                            )
                        }
                    }
                    cancelSection(reminder)
                }
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .padding(.bottom, 28)
            }
            .scrollIndicators(.hidden)
        }
        .task(id: reminder.version) { await loadRuns(reminder) }
    }

    private func cancelSection(_ reminder: Reminder) -> some View {
        SettingsSection(nil, footer: errorMessage) {
            SettingsListGroup {
                Button(role: .destructive) {
                    isConfirming = true
                } label: {
                    HStack {
                        Text("Cancel Reminder")
                        if isCanceling { ProgressView().padding(.leading, 4) }
                    }
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(.red)
                .disabled(isCanceling)
                // On the button, so the confirmation points at what asked for it.
                .confirmationDialog(
                    "Cancel \(reminder.title)?",
                    isPresented: $isConfirming,
                    titleVisibility: .visible
                ) {
                    Button("Cancel Reminder", role: .destructive) {
                        Task { await cancel(reminder) }
                    }
                    Button("Keep", role: .cancel) {}
                } message: {
                    Text(
                        reminder.kind == .once
                            ? "\(model.agentName) will not be woken for it."
                            : "\(model.agentName) will not be woken for it again. Past runs stay in History for 30 days."
                    )
                }
            }
        }
    }

    private func context(_ reminder: Reminder) -> some View {
        SettingsSection("Context") {
            SettingsListGroup {
                AutomationChatRow(label: model.actions.chatLabels[reminder.anchorChatID]) {
                    onOpenChat(reminder.anchorChatID)
                }
                AutomationFactRow(
                    title: "Created",
                    value: AutomationFormatting.timestamp(reminder.createdAt),
                    showsDivider: reminder.hasScript
                )
                if reminder.hasScript {
                    AutomationFactRow(
                        title: "Script",
                        value: "Attached · \(AutomationFormatting.byteSize(reminder.scriptBytes))",
                        showsDivider: false
                    )
                }
            }
        }
    }

    private func loadRuns(_ reminder: Reminder) async {
        guard reminder.kind == .recurring else { return }
        do {
            // The Server returns oldest first; the screen reads newest first.
            runs = try await model.actions.loadReminderRuns(reminder.id).reversed()
            runsFailed = false
        } catch {
            runsFailed = runs == nil
        }
    }

    /// Success removes the Reminder from the schedule, which pops this screen.
    private func cancel(_ reminder: Reminder) async {
        isCanceling = true
        errorMessage = nil
        do {
            try await model.cancel(reminder)
        } catch {
            errorMessage = error.localizedDescription
        }
        isCanceling = false
    }
}
