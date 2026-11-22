import Foundation
import HausModels
import Testing

@Suite("Captain stop phase")
struct CaptainStopPhaseTests {
    @Test("Stop is offered only for a running turn")
    func offeredWhileWorking() {
        #expect(CaptainStopPhase.resolve(availability: .working, isStopPending: false, canStop: true) == .available)
        for availability: AgentAvailability in [.idle, .error, .offline] {
            #expect(CaptainStopPhase.resolve(availability: availability, isStopPending: false, canStop: true) == nil)
        }
    }

    @Test("A pending stop wins over every availability, and a settled one reads Stopped")
    func pendingThenStopped() {
        #expect(CaptainStopPhase.resolve(availability: .working, isStopPending: true, canStop: true) == .stopping)
        #expect(CaptainStopPhase.resolve(availability: .stopped, isStopPending: true, canStop: true) == .stopping)
        #expect(CaptainStopPhase.resolve(availability: .stopped, isStopPending: false, canStop: true) == .stopped)
    }

    @Test("A viewer who cannot stop Captains sees nothing")
    func memberSeesNothing() {
        #expect(CaptainStopPhase.resolve(availability: .working, isStopPending: true, canStop: false) == nil)
    }

    @Test("Only a stop still winding down a turn is pending")
    func pendingAnswer() throws {
        func state(running: Bool, stopped: Bool) throws -> AgentDeliveryState {
            try HausJSON.decoder().decode(AgentDeliveryState.self, from: Data(
                #"{"agentId":"agent_1","pending":0,"running":\#(running),"stopped":\#(stopped)}"#.utf8
            ))
        }
        #expect(CaptainStopPhase.isPending(try state(running: true, stopped: true)))
        #expect(!CaptainStopPhase.isPending(try state(running: false, stopped: true)))
        #expect(!CaptainStopPhase.isPending(try state(running: true, stopped: false)))
    }
}
