import Foundation
import HausModels
import HausTransport

/// Stop on the Captain (`agent.stop`). A stop the Server took while a turn
/// still runs reads as pending until that turn settles; one with nothing
/// running reads as stopped at once.
extension CaptainsModel {
    public func stopPhase(for agent: AgentSummary, canStop: Bool) -> CaptainStopPhase? {
        CaptainStopPhase.resolve(
            availability: availability(for: agent),
            isStopPending: pendingStops.contains(agent.id),
            canStop: canStop
        )
    }

    /// Asks the Server to stop the Captain's turn. The stop reads as pending
    /// from the request on, and the Server's answer decides what it reads
    /// next. A refusal drops the pending stop and throws.
    public func stop(agentID: String) async throws {
        let ticket = try scope.requireTicket()
        pendingStops.insert(agentID)
        do {
            let state = try await client.call(
                AgentProcedures.stop,
                AgentTarget(agentID: agentID, serverID: ticket.serverID)
            )
            guard scope.isCurrent(ticket) else { return }
            record(state)
        } catch {
            if scope.isCurrent(ticket) { pendingStops.remove(agentID) }
            throw error
        }
    }

    /// Applies one delivery-state answer for a Captain.
    public func record(_ state: AgentDeliveryState) {
        if CaptainStopPhase.isPending(state) {
            pendingStops.insert(state.agentID)
            return
        }
        if pendingStops.contains(state.agentID) { pendingStops.remove(state.agentID) }
        if state.stopped { lifecycleAvailability[state.agentID] = .stopped }
    }

    /// Re-reads each pending stop, so a settlement this client missed while
    /// it was away cannot leave a Captain reading "Stopping…".
    func refreshPendingStops(serverID: String) async {
        guard let ticket = scope.ticket, ticket.serverID == serverID else { return }
        for agentID in pendingStops {
            do {
                let state = try await client.call(
                    AgentProcedures.deliveryState,
                    AgentTarget(agentID: agentID, serverID: serverID)
                )
                guard scope.isCurrent(ticket) else { return }
                record(state)
            } catch is CancellationError {
                return
            } catch {
                Self.logger.warning("Stop state refresh failed: \(error.localizedDescription, privacy: .public)")
            }
        }
    }
}
