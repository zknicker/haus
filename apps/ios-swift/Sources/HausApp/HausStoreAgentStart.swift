import Foundation
import HausModels
import HausTransport
import HausUI

/// Starting a stopped Agent from its DM (the App's `useAgentStart`).
extension HausStore {
    var stoppedAgentSource: StoppedAgentSource {
        StoppedAgentSource(
            stoppedAgentName: { [weak self] agentID in
                guard let self, let agent = agentsByID[agentID],
                      availability(for: agent) == .stopped
                else { return nil }
                return agent.displayName
            },
            canStart: { [weak self] in self?.canManageServer ?? false },
            start: { [weak self] agentID in
                guard let self else { throw HausStoreError.serverUnavailable }
                try await startAgent(agentID: agentID)
            }
        )
    }

    /// Asks the Server to start the Agent, then refreshes the directory so the
    /// notice clears even if the lifecycle event that follows is missed.
    func startAgent(agentID: String) async throws {
        guard let serverID = activeServer?.id else { throw HausStoreError.serverUnavailable }
        let _: JSONValue = try await client.mutation(
            "agent.start",
            input: AgentStartInput(agentId: agentID, serverId: serverID)
        )
        await reloadAgentAvailability(serverID: serverID)
    }
}

struct AgentStartInput: Encodable, Sendable {
    let agentId: String
    let serverId: String
}
