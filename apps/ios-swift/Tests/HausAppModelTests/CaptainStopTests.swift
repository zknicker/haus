import Foundation
import HausModels
import Testing
@testable import HausAppModel

@MainActor
@Suite("Stop on the Captain")
struct CaptainStopTests {
    private let scope = ServerScope(serverID: "srv_preview")
    private let agent = HausPreviewFixtures.agents[0]

    private func model() -> CaptainsModel {
        let captains = CaptainsModel(client: AppModelFixtures.client, scope: scope)
        captains.agents = HausPreviewFixtures.agents
        return captains
    }

    private func working(_ captains: CaptainsModel) {
        captains.apply(lifecycle(.working))
    }

    private func lifecycle(_ phase: AgentLifecyclePhase, outcome: AgentLifecycleOutcome? = nil) -> AgentLifecycleEvent {
        AgentLifecycleEvent(agentID: agent.id, chatID: nil, emittedAt: Date(timeIntervalSince1970: 0), runID: "run_1",
                            serverID: "srv_preview", phase: phase, outcome: outcome)
    }

    private func answer(running: Bool, stopped: Bool) throws -> AgentDeliveryState {
        try HausJSON.decoder().decode(AgentDeliveryState.self, from: Data(
            #"{"agentId":"\#(agent.id)","pending":0,"running":\#(running),"stopped":\#(stopped)}"#.utf8
        ))
    }

    @Test("A working Captain offers Stop to an Owner or Admin, and nothing to a Member")
    func offeredByRole() {
        let captains = model()
        working(captains)
        #expect(captains.stopPhase(for: agent, canStop: true) == .available)
        #expect(captains.stopPhase(for: agent, canStop: false) == nil)
    }

    @Test("A stop the Server took mid-turn reads Stopping until the turn settles, then Stopped")
    func pendingUntilSettled() throws {
        let captains = model()
        working(captains)
        captains.record(try answer(running: true, stopped: true))
        #expect(captains.stopPhase(for: agent, canStop: true) == .stopping)

        captains.apply(lifecycle(.settled, outcome: .stopped))
        #expect(captains.pendingStops.isEmpty)
        #expect(captains.stopPhase(for: agent, canStop: true) == .stopped)
    }

    @Test("A stop with nothing running reads Stopped at once")
    func settledAnswer() throws {
        let captains = model()
        working(captains)
        captains.record(try answer(running: false, stopped: true))
        #expect(captains.pendingStops.isEmpty)
        #expect(captains.stopPhase(for: agent, canStop: true) == .stopped)
    }

    @Test("A Server switch drops every pending stop")
    func resetClears() throws {
        let captains = model()
        captains.record(try answer(running: true, stopped: true))
        captains.reset()
        #expect(captains.pendingStops.isEmpty)
    }
}
