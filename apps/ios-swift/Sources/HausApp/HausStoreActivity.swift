import Foundation
import HausModels

extension HausStore {
    // MARK: - Lifecycle overlay

    func handle(lifecycleEvent event: AgentLifecycleEvent) {
        markConnected()
        lifecycleRevision += 1

        switch event.phase {
        case .working, .reading, .sending:
            if let current = currentActivityByAgentID[event.agentID], current.runID != event.runID {
                currentActivityByAgentID.removeValue(forKey: event.agentID)
            }
            setLifecycleAvailability(.working, for: event.agentID)
        case .settled:
            let settled: AgentAvailability = switch event.outcome {
            case .completed: .idle
            case .failed: .error
            case .stopped: .stopped
            case nil: .idle
            }
            setLifecycleAvailability(settled, for: event.agentID)
            if currentActivityByAgentID[event.agentID] != nil {
                currentActivityByAgentID.removeValue(forKey: event.agentID)
            }
            if currentActivityPositionByRunID[event.runID] != nil {
                currentActivityPositionByRunID.removeValue(forKey: event.runID)
            }
        }
    }

    /// Refreshes the canonical Agent list behind the overlay. A lifecycle event
    /// that lands while this read is in flight is newer than the list, so the
    /// overlay is only dropped when the revision stands still.
    func reloadAgentAvailability(serverID: String) async {
        guard activeServer?.id == serverID else { return }
        let revisionAtStart = lifecycleRevision
        do {
            let refreshed: [AgentSummary] = try await client.query(
                "agent.list",
                input: ServerScopedInput(serverId: serverID)
            )
            guard activeServer?.id == serverID else { return }
            agents = refreshed
            clearLifecycleAvailability(ifRevisionIs: revisionAtStart)
            await reloadActiveActivity(serverID: serverID)
        } catch is CancellationError {
            return
        } catch {
            Self.logger.warning("Agent availability refresh failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func clearLifecycleAvailability(ifRevisionIs revision: Int) {
        guard lifecycleRevision == revision, !lifecycleAvailability.isEmpty else { return }
        lifecycleAvailability.removeAll()
    }

    private func setLifecycleAvailability(_ availability: AgentAvailability, for agentID: String) {
        guard lifecycleAvailability[agentID] != availability else { return }
        lifecycleAvailability[agentID] = availability
    }

    // MARK: - Semantic activity

    func loadAgentActivityHistory(agentID: String) async throws -> [AgentActivityEvent] {
        guard let serverID = activeServer?.id else {
            throw HausStoreError.serverUnavailable
        }
        let page: AgentActivityHistoryPage = try await client.query(
            "agent.activityHistory",
            input: AgentActivityHistoryInput(agentId: agentID, serverId: serverID)
        )
        return page.events
    }

    /// Reads the projection without applying it, so a batched Server snapshot
    /// can apply it in the same pass as the Agent list it is derived from.
    func fetchActiveActivity(serverID: String) async -> AgentActiveActivitySnapshot? {
        guard activeServer?.id == serverID else { return nil }
        do {
            let snapshot: AgentActiveActivitySnapshot = try await client.query(
                "agent.activeActivity",
                input: ServerScopedInput(serverId: serverID)
            )
            guard activeServer?.id == serverID else { return nil }
            return snapshot
        } catch {
            // Lifecycle availability remains authoritative for the dot. A
            // transient semantic-activity failure must not make an Agent idle.
            return nil
        }
    }

    func reloadActiveActivity(serverID: String) async {
        guard let snapshot = await fetchActiveActivity(serverID: serverID) else { return }
        replaceActiveActivitySnapshot(snapshot)
    }

    func replaceActiveActivitySnapshot(_ snapshot: AgentActiveActivitySnapshot) {
        hasAgentActivitySnapshot = true
        let workingAgentIDs = Set(
            agents.filter { availability(for: $0) == .working }.map(\.id)
        )
        let activity: [String: AgentActivityEvent] = Dictionary(
            uniqueKeysWithValues: snapshot.activities.compactMap { event -> (String, AgentActivityEvent)? in
                guard workingAgentIDs.contains(event.agentID),
                      event.phase == .started || event.isFinishing
                else { return nil }
                return (event.agentID, event)
            }
        )
        let positions: [String: Int] = Dictionary(
            uniqueKeysWithValues: snapshot.activities.map { ($0.runID, $0.position) }
        )
        // This projection is re-read on every stream connect and snapshot, and
        // it is usually identical. Observation cannot tell that apart from a
        // change, so the comparison has to happen here.
        if currentActivityByAgentID != activity { currentActivityByAgentID = activity }
        if currentActivityPositionByRunID != positions { currentActivityPositionByRunID = positions }
    }

    func handle(activityEvent event: AgentActivityEvent) {
        guard event.serverID == activeServer?.id else { return }
        let latestPosition = currentActivityPositionByRunID[event.runID] ?? 0
        guard event.position > latestPosition else { return }
        currentActivityPositionByRunID[event.runID] = event.position

        let current = currentActivityByAgentID[event.agentID]
        if current?.runID == event.runID, event.isTerminal {
            // Canonical lifecycle settlement removes the row and yellow dot
            // together. Preserve the last useful semantic label until then.
            return
        }
        if current?.runID == event.runID,
           current?.isFinishing == true,
           event.phase != .started {
            return
        }
        if event.phase == .started || event.isFinishing {
            currentActivityByAgentID[event.agentID] = event
        } else if current?.runID == event.runID {
            currentActivityByAgentID[event.agentID] = event.projectedAsWorking()
        }
    }
}
