import Foundation
import HausModels
import HausTransport
import HausUI

extension HausStore {
    /// The Automations screen's Server reads and its one mutation. Every read
    /// names the active Server; Reminders and Triggers are Owner and Admin
    /// reads, which the Settings entry already gates on.
    func agentAutomations(openChat: @escaping @MainActor @Sendable (String) -> Void) -> AgentAutomationsActions {
        AgentAutomationsActions(
            loadReminders: { [weak self] agentID in
                guard let self, let serverID = await self.activeServer?.id else { throw CancellationError() }
                return try await self.client.query(
                    "reminder.list", input: AgentAutomationListInput(agentId: agentID, serverId: serverID)
                )
            },
            loadTriggers: { [weak self] agentID in
                guard let self, let serverID = await self.activeServer?.id else { throw CancellationError() }
                return try await self.client.query(
                    "trigger.list", input: AgentAutomationListInput(agentId: agentID, serverId: serverID)
                )
            },
            loadReminderRuns: { [weak self] reminderID in
                guard let self, let serverID = await self.activeServer?.id else { throw CancellationError() }
                return try await self.client.query(
                    "reminder.runs", input: ReminderRunsInput(reminderId: reminderID, serverId: serverID)
                )
            },
            loadTriggerRuns: { [weak self] triggerID in
                guard let self, let serverID = await self.activeServer?.id else { throw CancellationError() }
                return try await self.client.query(
                    "trigger.runs", input: TriggerRunsInput(serverId: serverID, triggerId: triggerID)
                )
            },
            cancelReminder: { [weak self] reminder in
                guard let self, let serverID = await self.activeServer?.id else { throw CancellationError() }
                // `commandId` makes a retried press replay the first result;
                // `expectedVersion` refuses a cancel against a stale snapshot.
                let _: ReminderMutationResult = try await self.client.mutation(
                    "reminder.cancel",
                    input: ReminderCancelInput(
                        commandId: UUID().uuidString,
                        expectedVersion: reminder.version,
                        reminderId: reminder.id,
                        serverId: serverID
                    )
                )
            },
            chatLabels: automationChatLabels,
            openChat: openChat
        )
    }

    /// The App's `chatPlace`: a channel by name, any other Chat as "DM".
    private var automationChatLabels: [String: String] {
        Dictionary(
            chats.map { chat in
                (chat.id, chat.kind == .channel ? "#\(chat.name ?? "channel")" : "DM")
            },
            uniquingKeysWith: { current, _ in current }
        )
    }
}

private struct AgentAutomationListInput: Encodable, Sendable {
    let agentId: String
    let serverId: String
}

private struct ReminderRunsInput: Encodable, Sendable {
    let reminderId: String
    let serverId: String
}

private struct TriggerRunsInput: Encodable, Sendable {
    let serverId: String
    let triggerId: String
}

private struct ReminderCancelInput: Encodable, Sendable {
    let commandId: String
    let expectedVersion: Int
    let reminderId: String
    let serverId: String
}
