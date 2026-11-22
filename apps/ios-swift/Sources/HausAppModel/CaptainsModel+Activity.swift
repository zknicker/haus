import Foundation
import HausModels
import HausTransport

extension CaptainsModel {
    // MARK: - Semantic activity

    /// Applies one `agent.onActivity` event, in run-position order.
    public func apply(_ event: AgentActivityEvent) {
        guard scope.isActive(event.serverID) else { return }
        defer { recordLiveStep(event) }
        let latestPosition = activityPositionByRunID[event.runID] ?? 0
        guard event.position > latestPosition else { return }
        activityPositionByRunID[event.runID] = event.position

        let current = currentActivityByAgentID[event.agentID]
        if current?.runID == event.runID, event.isTerminal {
            // Lifecycle settlement removes the row and the dot together; the
            // last useful label stays until then.
            return
        }
        if current?.runID == event.runID, current?.isFinishing == true, event.phase != .started {
            return
        }
        if event.phase == .started || event.isFinishing {
            currentActivityByAgentID[event.agentID] = event
        } else if current?.runID == event.runID {
            currentActivityByAgentID[event.agentID] = event.projectedAsWorking()
        }
    }

    public func replaceActiveActivity(_ snapshot: AgentActiveActivitySnapshot) {
        hasActivitySnapshot = true
        let workingAgentIDs = Set(agents.filter { availability(for: $0) == .working }.map(\.id))
        let activity: [String: AgentActivityEvent] = Dictionary(
            uniqueKeysWithValues: snapshot.activities.compactMap { event -> (String, AgentActivityEvent)? in
                guard workingAgentIDs.contains(event.agentID),
                      event.phase == .started || event.isFinishing
                else { return nil }
                return (event.agentID, event)
            }
        )
        let positions = Dictionary(uniqueKeysWithValues: snapshot.activities.map { ($0.runID, $0.position) })
        // Re-read on every stream connect and snapshot, and usually identical.
        if currentActivityByAgentID != activity { currentActivityByAgentID = activity }
        if activityPositionByRunID != positions { activityPositionByRunID = positions }
        replaceLiveRuns(snapshot.current.filter { workingAgentIDs.contains($0.event.agentID) })
    }

    // MARK: - Reads

    /// Refreshes the Agent list behind the overlay, then the activity derived
    /// from it. A lifecycle event that lands while the list is in flight is
    /// newer, so the overlay drops only when the revision stood still.
    public func reloadAvailability(serverID: String) async {
        guard let ticket = scope.ticket, ticket.serverID == serverID else { return }
        let revisionAtStart = lifecycleRevision
        let readStart = scope.reconciliation.beginRead()
        do {
            let refreshed: [AgentSummary] = try await client.query(
                "agent.list",
                input: ServerScopeInput(serverID: serverID)
            )
            guard scope.isCurrent(ticket),
                  scope.reconciliation.landed(.agentAvailability, readStartedAt: readStart)
            else { return }
            agents = refreshed
            clearLifecycleAvailability(ifRevisionIs: revisionAtStart)
            await reloadActiveActivity(serverID: serverID)
        } catch is CancellationError {
            return
        } catch {
            Self.logger.warning("Agent availability refresh failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Reads the projection without applying it, so a batched Server
    /// snapshot can apply it in one pass with the Agent list it derives from.
    public func fetchActiveActivity(serverID: String) async -> AgentActiveActivitySnapshot? {
        guard let ticket = scope.ticket, ticket.serverID == serverID else { return nil }
        do {
            let snapshot: AgentActiveActivitySnapshot = try await client.query(
                "agent.activeActivity",
                input: ServerScopeInput(serverID: serverID)
            )
            guard scope.isCurrent(ticket) else { return nil }
            return snapshot
        } catch {
            // Lifecycle availability stays authoritative for the dot; a
            // transient activity failure must not make a Captain idle.
            return nil
        }
    }

    public func reloadActiveActivity(serverID: String) async {
        let readStart = scope.reconciliation.beginRead()
        guard let snapshot = await fetchActiveActivity(serverID: serverID),
              scope.reconciliation.landed(.agentActivity, readStartedAt: readStart)
        else { return }
        replaceActiveActivity(snapshot)
    }

    public func activityHistory(agentID: String) async throws -> [AgentActivityEvent] {
        let ticket = try scope.requireTicket()
        let page: AgentActivityHistoryPage = try await client.query(
            "agent.activityHistory",
            input: AgentActivityHistoryInput(agentId: agentID, serverId: ticket.serverID)
        )
        return page.events
    }
}
