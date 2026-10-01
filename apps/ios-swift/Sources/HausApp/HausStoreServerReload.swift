import Foundation
import HausModels

extension HausStore {
    /// The first load of a Server: its Chat list, directory, activity, and
    /// Computers, then the page of the Chat the user lands on.
    func reloadServer(_ serverID: String) async throws {
        async let loadedChats: [ChatSummary] = client.query(
            "chat.list",
            input: ServerScopedInput(serverId: serverID)
        )
        async let loadedAgents: [AgentSummary] = client.query(
            "agent.list",
            input: ServerScopedInput(serverId: serverID)
        )
        async let loadedMembers: MemberList = client.query(
            "member.list",
            input: ServerScopedInput(serverId: serverID)
        )
        async let iconBadge: Void = refreshIconBadge()
        chats = try await loadedChats
        agents = try await loadedAgents
        if !lifecycleAvailability.isEmpty { lifecycleAvailability.removeAll() }
        members = try await loadedMembers
        await iconBadge
        await reloadActiveActivity(serverID: serverID)
        await loadComputers(serverID: serverID)

        let initialChatID = preferredInitialChatID
            .flatMap { preferred in chats.first { $0.id == preferred }?.id }
            ?? chats.first?.id
        if let initialChatID {
            await loadMessages(chatID: initialChatID)
        }
    }
}
