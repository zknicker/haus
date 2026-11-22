import Foundation
import HausModels
import Testing
@testable import HausUI

/// Adapted from the App's `features/workers/worker-follow-up-controls.test.ts`.
@Suite struct WorkerViewControlsTests {
    @Test func anEmptyFieldOnALiveTurnOffersStop() {
        let controls = WorkerFollowUpControls(canStop: true, draft: "", sending: false, stopHeld: false)

        #expect(controls.mode == .stop)
        #expect(controls.label == "Stop Worker")
        #expect(!controls.isDisabled)
    }

    @Test func aSendInFlightNeverTurnsTheButtonIntoStop() {
        let typed = WorkerFollowUpControls(canStop: true, draft: "Match iPhone.", sending: true, stopHeld: false)
        let cleared = WorkerFollowUpControls(canStop: true, draft: "", sending: true, stopHeld: false)

        #expect(typed.mode == .sending)
        #expect(typed.label == "Send follow-up")
        #expect(typed.isDisabled)
        #expect(!cleared.stops)
    }

    @Test func rightAfterASendTheClearedFieldStaysADisabledSendUntilThePersonTypes() {
        let controls = WorkerFollowUpControls(canStop: true, draft: "", sending: false, stopHeld: true)

        #expect(controls.mode == .send)
        #expect(controls.label == "Send follow-up")
        #expect(controls.isDisabled)
    }

    @Test func typedTextSendsAndAnEmptyFieldWithNothingToStopIsDisabled() {
        let typed = WorkerFollowUpControls(canStop: true, draft: "Match iPhone.", sending: false, stopHeld: false)
        let idle = WorkerFollowUpControls(canStop: false, draft: "", sending: false, stopHeld: false)

        #expect(typed.mode == .send)
        #expect(!typed.isDisabled)
        #expect(idle.mode == .send)
        #expect(idle.isDisabled)
    }

    @Test func whitespaceIsAnEmptyField() {
        let controls = WorkerFollowUpControls(canStop: true, draft: "  \n", sending: false, stopHeld: false)

        #expect(controls.stops)
    }

    @Test func thePlaceholderSaysWhenAFollowUpGoesIn() {
        #expect(WorkerFollowUpControls.placeholder(status: .working, live: true) == "Goes in when this turn ends")
        #expect(WorkerFollowUpControls.placeholder(status: .needsYou, live: false) == "Answer this Worker")
        #expect(WorkerFollowUpControls.placeholder(status: .done, live: false) == "Follow up")
    }

    @Test func onlyAnActiveNewestTurnIsLive() throws {
        let running = try WorkerViewFixture.worker(runs: [
            WorkerFixture.run(runId: "wkt_two", status: "running"),
            WorkerFixture.run(runId: "wkt_one", terminalAt: WorkerViewFixture.at(minutes: 14)),
        ])
        let stopping = try WorkerViewFixture.worker(runs: [
            WorkerFixture.run(status: "running", stopRequestedAt: WorkerViewFixture.at(minutes: 1)),
        ])
        let done = try WorkerViewFixture.worker(
            status: "done",
            runs: [WorkerFixture.run(terminalAt: WorkerViewFixture.at(minutes: 14))]
        )

        #expect(WorkerLiveTurn(worker: running)?.turnId == "wkt_two")
        #expect(WorkerLiveTurn(worker: stopping)?.stopRequested == true)
        #expect(WorkerLiveTurn(worker: done) == nil)
    }
}
