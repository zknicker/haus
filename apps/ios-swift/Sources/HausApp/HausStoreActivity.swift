import Foundation
import HausModels

/// Live presence and activity live in `CaptainsModel`; the store adds what a
/// lifecycle event means for the rest of the app.
extension HausStore {
    func handle(lifecycleEvent event: AgentLifecycleEvent) {
        let applied = captains.apply(event)
        guard applied != .ignored else { return }
        markConnected()
        // The turn's tokens now count toward the Inbox strip's week.
        if applied == .settled, serverUsage != nil {
            requestRecovery([.serverUsage], serverID: event.serverID)
        }
    }

    func handle(activityEvent event: AgentActivityEvent) {
        captains.apply(event)
    }

    func clearLifecycleAvailability(ifRevisionIs revision: Int) {
        captains.clearLifecycleAvailability(ifRevisionIs: revision)
    }

    func loadAgentActivityHistory(agentID: String) async throws -> [AgentActivityEvent] {
        try await captains.activityHistory(agentID: agentID)
    }

    func fetchActiveActivity(serverID: String) async -> AgentActiveActivitySnapshot? {
        await captains.fetchActiveActivity(serverID: serverID)
    }

    func replaceActiveActivitySnapshot(_ snapshot: AgentActiveActivitySnapshot) {
        captains.replaceActiveActivity(snapshot)
    }
}
