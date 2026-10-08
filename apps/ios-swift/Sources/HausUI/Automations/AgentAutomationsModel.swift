import Foundation
import HausModels
import Observation

/// One Agent's Reminders and Triggers, read together and refreshed by the
/// screen. A detail screen resolves its record here by id, so after a cancel
/// or a fire it always shows the Server's latest version.
@MainActor
@Observable
final class AgentAutomationsModel {
    /// Nil until the first read settles: an unsettled read is not an empty one.
    private(set) var reminders: [Reminder]?
    private(set) var triggers: [Trigger]?
    private(set) var remindersFailed = false
    private(set) var triggersFailed = false

    let agentID: String
    let agentName: String
    let actions: AgentAutomationsActions

    init(agentID: String, agentName: String, actions: AgentAutomationsActions) {
        self.agentID = agentID
        self.agentName = agentName
        self.actions = actions
    }

    /// Only the wakes still coming, in the Server's `fireAt` order.
    var scheduled: [Reminder]? { reminders.map(AutomationFormatting.scheduled) }

    func reminder(id: String) -> Reminder? { scheduled?.first { $0.id == id } }
    func trigger(id: String) -> Trigger? { triggers?.first { $0.id == id } }

    func load() async {
        async let reminders: Void = loadReminders()
        async let triggers: Void = loadTriggers()
        _ = await (reminders, triggers)
    }

    /// The Server checks `expectedVersion`, and a recurring Reminder bumps its
    /// version on every fire, so the list is reread after a refusal as well as
    /// after success; otherwise every retry repeats the same stale version.
    func cancel(_ reminder: Reminder) async throws {
        do {
            try await actions.cancelReminder(reminder)
        } catch {
            await loadReminders()
            throw error
        }
        await loadReminders()
    }

    /// A failed refresh keeps what the screen already shows.
    private func loadReminders() async {
        do {
            reminders = try await actions.loadReminders(agentID)
            remindersFailed = false
        } catch {
            remindersFailed = reminders == nil
        }
    }

    private func loadTriggers() async {
        do {
            triggers = try await actions.loadTriggers(agentID)
            triggersFailed = false
        } catch {
            triggersFailed = triggers == nil
        }
    }
}
