import Foundation
import HausModels
import HausTransport

/// Turn details reads: each Captain's live run (kept from `agent.onActivity` and the active
/// snapshot), settled turns for everyone, and execution evidence for Owners and Admins
/// (`specs/ios-app.md`, "Live work and turn details").
extension CaptainsModel {
    // MARK: - Live runs

    /// Logs one applied activity event into its Captain's live run. A run starts its log once
    /// the event has made it the Captain's current activity.
    func recordLiveStep(_ event: AgentActivityEvent) {
        if let live = liveRunsByAgentID[event.agentID], live.runID == event.runID {
            let next = live.merging([event])
            if next != live { liveRunsByAgentID[event.agentID] = next }
        } else if currentActivityByAgentID[event.agentID]?.runID == event.runID {
            liveRunsByAgentID[event.agentID] = CaptainLiveRun(agentID: event.agentID, runID: event.runID, events: [event])
        }
    }

    /// The active snapshot names every working Captain's run and when it started.
    func replaceLiveRuns(_ current: [AgentCurrentActivity]) {
        var runs: [String: CaptainLiveRun] = [:]
        for entry in current where runs[entry.event.agentID] == nil {
            let agentID = entry.event.agentID
            let existing = liveRunsByAgentID[agentID].flatMap { $0.runID == entry.event.runID ? $0 : nil }
            let base = existing ?? CaptainLiveRun(agentID: agentID, runID: entry.event.runID)
            runs[agentID] = base.merging([entry.event]).started(at: entry.runStartedAt)
        }
        if liveRunsByAgentID != runs { liveRunsByAgentID = runs }
    }

    /// Fills a live run's earlier steps on a mid-run open. It lands only while that run is
    /// still the Captain's live run.
    public func loadLiveRunHistory(agentID: String, runID: String) async throws {
        let ticket = try scope.requireTicket()
        guard let input = AgentActivityHistoryInput(
            agentId: agentID,
            limit: AgentActivityHistoryInput.limitRange.upperBound,
            serverId: ticket.serverID,
            before: nil,
            runId: runID
        ) else { return }
        let page = try await client.call(AgentProcedures.activityHistory, input)
        guard scope.isCurrent(ticket), let live = liveRunsByAgentID[agentID], live.runID == runID else { return }
        let next = live.merging(page.events)
        if next != live { liveRunsByAgentID[agentID] = next }
    }

    // MARK: - Settled turns

    /// A Captain's newest settled turns, newest first.
    public func turns(agentID: String, limit: Int = 10) async throws -> [AgentTurn] {
        let ticket = try scope.requireTicket()
        guard let input = AgentTurnsInput(agentID: agentID, serverID: ticket.serverID, limit: limit) else { return [] }
        let turns = try await client.call(AgentProcedures.turns, input)
        try requireCurrent(ticket)
        return turns
    }

    // MARK: - Execution evidence (Owners and Admins)

    public func executionOutlines(agentID: String, runIDs: [String]) async throws -> [AgentExecutionOutlineEntry] {
        let ticket = try scope.requireTicket()
        let unique = runIDs.reduce(into: [String]()) { ids, id in if !ids.contains(id) { ids.append(id) } }
        guard let input = AgentExecutionOutlinesInput(
            agentID: agentID,
            runIDs: Array(unique.prefix(AgentExecutionOutlinesInput.maximumRuns)),
            serverID: ticket.serverID
        ) else { return [] }
        let read = try await client.call(AgentProcedures.executionOutlines, input)
        try requireCurrent(ticket)
        return read.outlines
    }

    public func executionJournal(agentID: String, runID: String) async throws -> AgentExecutionJournalResult {
        let ticket = try scope.requireTicket()
        let journal = try await client.call(
            AgentProcedures.executionJournal,
            AgentRunTarget(agentID: agentID, runID: runID, serverID: ticket.serverID)
        )
        try requireCurrent(ticket)
        return journal
    }

    /// `agent.onExecutionJournal` for one run: a notice that its journal changed, so the open
    /// sheet re-reads it. The caller holds it only while the sheet is open.
    public func executionJournalChanges(agentID: String, runID: String) throws -> AsyncThrowingStream<AgentExecutionJournalChange, Error> {
        let ticket = try scope.requireTicket()
        return client.subscribe(
            RealtimeStream.agentExecutionJournal.path,
            input: AgentRunTarget(agentID: agentID, runID: runID, serverID: ticket.serverID)
        )
    }

    /// Whether a refusal says the viewer may not read execution evidence.
    public nonisolated static func isEvidenceRefusal(_ error: Error) -> Bool {
        guard let error = error as? TRPCError else { return false }
        return error.domainCode == "FORBIDDEN" || error.httpStatus == 403
    }

    private func requireCurrent(_ ticket: ServerTicket) throws {
        guard scope.isCurrent(ticket) else { throw CancellationError() }
    }
}
