import Foundation
import HausModels

/// The Server reads and the one mutation the Automations screen needs, owned
/// by the app layer. Every id is the Agent's, the Reminder's, or the
/// Trigger's; the app supplies the active Server.
public struct AgentAutomationsActions: Sendable {
    /// `reminder.list` for one Agent.
    public let loadReminders: @Sendable (String) async throws -> [Reminder]
    /// `trigger.list` for one Agent.
    public let loadTriggers: @Sendable (String) async throws -> [Trigger]
    /// `reminder.runs`, oldest first as the Server returns them.
    public let loadReminderRuns: @Sendable (String) async throws -> [ReminderFire]
    /// `trigger.runs`, newest first.
    public let loadTriggerRuns: @Sendable (String) async throws -> [TriggerFire]
    /// `reminder.cancel` with the snapshot's version and a fresh command id.
    public let cancelReminder: @Sendable (Reminder) async throws -> Void
    /// Where an automation was set, by Chat id: "#product" or "DM". A Chat
    /// missing here is not one the phone can open.
    public let chatLabels: [String: String]
    /// Puts the Chat on the canvas; Settings closes itself around it.
    public let openChat: @MainActor @Sendable (String) -> Void

    public init(
        loadReminders: @escaping @Sendable (String) async throws -> [Reminder],
        loadTriggers: @escaping @Sendable (String) async throws -> [Trigger],
        loadReminderRuns: @escaping @Sendable (String) async throws -> [ReminderFire],
        loadTriggerRuns: @escaping @Sendable (String) async throws -> [TriggerFire],
        cancelReminder: @escaping @Sendable (Reminder) async throws -> Void,
        chatLabels: [String: String],
        openChat: @escaping @MainActor @Sendable (String) -> Void
    ) {
        self.loadReminders = loadReminders
        self.loadTriggers = loadTriggers
        self.loadReminderRuns = loadReminderRuns
        self.loadTriggerRuns = loadTriggerRuns
        self.cancelReminder = cancelReminder
        self.chatLabels = chatLabels
        self.openChat = openChat
    }

    public static let preview = AgentAutomationsActions(
        loadReminders: { _ in AutomationFixtures.reminders },
        loadTriggers: { _ in AutomationFixtures.triggers },
        loadReminderRuns: { _ in AutomationFixtures.reminderRuns },
        loadTriggerRuns: { _ in AutomationFixtures.triggerFires },
        cancelReminder: { _ in },
        chatLabels: ["chat-product": "#product"],
        openChat: { _ in }
    )
}

enum AutomationFixtures {
    static let now = Date()

    static let reminders = [
        Reminder(
            anchorChatID: "chat-product", createdAt: now.addingTimeInterval(-86_400),
            description: "Post the launch checklist and ask who owns each open item.",
            fireAt: now.addingTimeInterval(3 * 86_400), id: "reminder-once",
            ownerAgentID: "agent-blippy", timezone: "UTC", title: "Launch checklist"
        ),
        Reminder(
            anchorChatID: "chat-product", createdAt: now.addingTimeInterval(-7 * 86_400),
            description: "Summarize last week's merged pull requests.",
            fireAt: now.addingTimeInterval(4 * 86_400), id: "reminder-weekly",
            ownerAgentID: "agent-blippy", repeatRule: "weekly:mon@15:57",
            timezone: "America/New_York", title: "Weekly digest"
        ),
    ]

    static let triggers = [
        Trigger(
            anchorChatID: "chat-product", createdAt: now.addingTimeInterval(-3 * 86_400),
            createdByHandle: "zach", fireCount: 4, id: "trigger-deploy",
            instruction: "Tell #product when a deploy finishes.",
            lastFiredAt: now.addingTimeInterval(-3 * 3_600), title: "Deploy finished"
        ),
    ]

    static let reminderRuns = [
        ReminderFire(firedAt: now.addingTimeInterval(-7 * 86_400), id: "run-1", scheduledFor: now.addingTimeInterval(-7 * 86_400)),
    ]

    static let triggerFires = [
        TriggerFire(contentType: "application/json", dedupeKey: nil, id: "fire-1", payloadBytes: 812, receivedAt: now.addingTimeInterval(-3 * 3_600)),
    ]
}
