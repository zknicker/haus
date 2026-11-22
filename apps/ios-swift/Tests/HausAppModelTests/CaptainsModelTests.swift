import Foundation
import HausModels
import Testing
@testable import HausAppModel

@MainActor
@Suite("Captains model")
struct CaptainsModelTests {
    private let scope = ServerScope(serverID: "srv_preview")
    private let agentID = HausPreviewFixtures.agents[0].id

    private func model() -> CaptainsModel {
        let captains = CaptainsModel(client: AppModelFixtures.client, scope: scope)
        captains.agents = HausPreviewFixtures.agents
        return captains
    }

    private func lifecycle(_ phase: AgentLifecyclePhase, run: String = "run_1", server: String = "srv_preview",
                           outcome: AgentLifecycleOutcome? = nil) -> AgentLifecycleEvent {
        AgentLifecycleEvent(agentID: agentID, chatID: nil, emittedAt: Date(timeIntervalSince1970: 0), runID: run,
                            serverID: server, phase: phase, outcome: outcome)
    }

    private func activity(_ position: Int, run: String = "run_1", category: AgentActivityCategory = .thinking,
                          phase: AgentActivityPhase = .started) -> AgentActivityEvent {
        AgentActivityEvent(agentID: agentID, category: category, id: "act_\(position)",
                           occurredAt: Date(timeIntervalSince1970: 0), phase: phase, position: position,
                           producer: .computer, producerID: "computer_preview", producerSequence: position,
                           runID: run, serverID: "srv_preview")
    }

    @Test("Equal Agent writes report nothing; a real change reports once")
    func equalWritesAreSilent() {
        let captains = model()
        var changes: [CaptainsChange] = []
        captains.onChange = { changes.append($0) }

        captains.agents = HausPreviewFixtures.agents
        captains.agents = []

        #expect(changes == [.agents([])])
    }

    @Test("Working then settled moves the presence overlay and clears the run's activity")
    func lifecycleOverlay() {
        let captains = model()
        #expect(captains.apply(lifecycle(.working)) == .working)
        captains.apply(activity(1))
        #expect(captains.isAnyAgentWorking)

        #expect(captains.apply(lifecycle(.settled, outcome: .failed)) == .settled)

        #expect(captains.lifecycleAvailability[agentID] == .error)
        #expect(captains.currentActivityByAgentID.isEmpty)
        #expect(!captains.isAnyAgentWorking)
        #expect(captains.lifecycleRevision == 2)
    }

    @Test("Events for a Server the app switched away from are dropped")
    func foreignServerIgnored() {
        let captains = model()
        #expect(captains.apply(lifecycle(.working, server: "srv_other")) == .ignored)
        #expect(captains.lifecycleAvailability.isEmpty)
        #expect(captains.lifecycleRevision == 0)
    }

    @Test("Activity applies in run-position order")
    func activityOrder() {
        let captains = model()
        captains.apply(activity(2, category: .readingFiles))
        captains.apply(activity(1, category: .thinking))

        #expect(captains.currentActivityByAgentID[agentID]?.category == .readingFiles)
        #expect(captains.activityPositionByRunID["run_1"] == 2)
    }

    @Test("The snapshot keeps activity only for Captains working now")
    func snapshotFiltersIdle() {
        let captains = model()
        let snapshot = AgentActiveActivitySnapshot(current: [AgentCurrentActivity(event: activity(3), runStartedAt: nil)])

        captains.replaceActiveActivity(snapshot)
        #expect(captains.hasActivitySnapshot)
        #expect(captains.currentActivityByAgentID.isEmpty)

        captains.apply(lifecycle(.working))
        captains.replaceActiveActivity(snapshot)
        #expect(captains.currentActivityByAgentID[agentID]?.position == 3)
    }

    @Test("A list read clears the overlay only when no lifecycle event landed meanwhile")
    func overlayClearsOnStillRevision() {
        let captains = model()
        captains.apply(lifecycle(.working))
        let revision = captains.lifecycleRevision
        captains.apply(lifecycle(.settled, outcome: .completed))

        captains.clearLifecycleAvailability(ifRevisionIs: revision)
        #expect(!captains.lifecycleAvailability.isEmpty)

        captains.clearLifecycleAvailability(ifRevisionIs: captains.lifecycleRevision)
        #expect(captains.lifecycleAvailability.isEmpty)
    }
}
