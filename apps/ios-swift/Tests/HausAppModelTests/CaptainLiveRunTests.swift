import Foundation
import HausModels
import Testing
@testable import HausAppModel

/// The live run turn details reads: kept from activity events, reconciled by run id with the
/// active snapshot and a mid-run history read, and gone at settlement.
@MainActor
@Suite("Captain live runs")
struct CaptainLiveRunTests {
    private let scope = ServerScope(serverID: "srv_preview")
    private let agentID = HausPreviewFixtures.agents[0].id
    private let started = Date(timeIntervalSince1970: 1_000)

    private func model() -> CaptainsModel {
        let captains = CaptainsModel(client: AppModelFixtures.client, scope: scope)
        captains.agents = HausPreviewFixtures.agents
        return captains
    }

    private func lifecycle(_ phase: AgentLifecyclePhase, run: String = "run_1") -> AgentLifecycleEvent {
        AgentLifecycleEvent(agentID: agentID, chatID: nil, emittedAt: started, runID: run,
                            serverID: "srv_preview", phase: phase, outcome: phase == .settled ? .completed : nil)
    }

    private func activity(_ position: Int, run: String = "run_1", category: AgentActivityCategory = .thinking,
                          phase: AgentActivityPhase = .started) -> AgentActivityEvent {
        AgentActivityEvent(agentID: agentID, category: category, id: "\(run)_\(position)",
                           occurredAt: started.addingTimeInterval(Double(position)), phase: phase,
                           position: position, producer: .computer, producerID: "computer_preview",
                           producerSequence: position, runID: run, serverID: "srv_preview")
    }

    @Test("A run logs every step in position order, whatever order they arrive in")
    func logsStepsInOrder() {
        let captains = model()
        captains.apply(lifecycle(.working))
        captains.apply(activity(1, category: .checkingMessages))
        captains.apply(activity(3, category: .readingFiles))
        captains.apply(activity(2, category: .checkingMessages, phase: .completed))

        let run = captains.liveRunsByAgentID[agentID]
        #expect(run?.runID == "run_1")
        #expect(run?.events.map(\.position) == [1, 2, 3])
    }

    @Test("A mid-run open takes the clock and current step from the active snapshot")
    func snapshotSeedsTheRun() {
        let captains = model()
        captains.apply(lifecycle(.working))
        captains.replaceActiveActivity(
            AgentActiveActivitySnapshot(current: [AgentCurrentActivity(event: activity(7), runStartedAt: started)])
        )

        let run = captains.liveRunsByAgentID[agentID]
        #expect(run?.startedAt == started)
        #expect(run?.events.map(\.position) == [7])
    }

    @Test("History and live events merge by position without duplicates")
    func historyMergesByPosition() {
        let live = CaptainLiveRun(agentID: agentID, runID: "run_1", events: [activity(4), activity(5)])
        let merged = live.merging([activity(1), activity(4), activity(2, run: "run_0")])

        #expect(merged.events.map(\.position) == [1, 4, 5])
        #expect(merged.events.first { $0.position == 4 } == activity(4))
    }

    @Test("A new run replaces the last one, and settlement clears it")
    func newRunAndSettlement() {
        let captains = model()
        captains.apply(lifecycle(.working))
        captains.apply(activity(1))
        captains.apply(lifecycle(.working, run: "run_2"))
        #expect(captains.liveRunsByAgentID[agentID] == nil)

        captains.apply(activity(1, run: "run_2"))
        #expect(captains.liveRunsByAgentID[agentID]?.runID == "run_2")

        captains.apply(lifecycle(.settled, run: "run_2"))
        #expect(captains.liveRunsByAgentID.isEmpty)
    }

    @Test("A late step of a settled run never brings it back")
    func lateStepAfterSettlement() {
        let captains = model()
        captains.apply(lifecycle(.working))
        captains.apply(activity(1))
        captains.apply(lifecycle(.settled))
        captains.apply(activity(2, phase: .completed))

        #expect(captains.liveRunsByAgentID.isEmpty)
    }

    @Test("A Server switch drops every live run")
    func resetClears() {
        let captains = model()
        captains.apply(lifecycle(.working))
        captains.apply(activity(1))
        captains.reset()

        #expect(captains.liveRunsByAgentID.isEmpty)
    }
}
