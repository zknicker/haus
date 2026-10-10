import Foundation
import XCTest
@testable import HausModels

/// Start-anchored recovery: the read-before-subscribe window.
final class RealtimeReconciliationTests: XCTestCase {
    /// The launch race: the Chat list read finishes, a message commits and
    /// publishes, and only then does the stream subscribe. The read predates
    /// the start, so the start reconciles it.
    func testAReadThatFinishedBeforeTheStreamStartedIsReconciled() {
        var reconciliation = RealtimeReconciliation()
        let launchRead = reconciliation.beginRead()
        reconciliation.landed(.chatList, readStartedAt: launchRead)

        reconciliation.streamStarted(reconciling: [.chatList, .openTranscripts])

        XCTAssertEqual(reconciliation.take(), [.chatList, .openTranscripts])
    }

    /// A read still in flight when the stream started began before it, so it
    /// may predate a commit the stream never saw: still reconciled.
    func testAReadInFlightAcrossTheStartIsStillReconciled() {
        var reconciliation = RealtimeReconciliation()
        let read = reconciliation.beginRead()
        reconciliation.streamStarted(reconciling: [.chatList])
        reconciliation.landed(.chatList, readStartedAt: read)

        XCTAssertEqual(reconciliation.take(), [.chatList])
    }

    /// Data loaded after this start began already reflects everything the
    /// stream could have missed.
    func testAReadBegunAfterTheStartIsSkipped() {
        var reconciliation = RealtimeReconciliation()
        reconciliation.streamStarted(reconciling: [.chatList, .taskLenses])
        let eventRead = reconciliation.beginRead()
        reconciliation.landed(.chatList, readStartedAt: eventRead)

        XCTAssertEqual(reconciliation.take(), [.taskLenses])
    }

    /// Streams starting together share one pass, anchored to the latest start.
    func testStartsLandingTogetherShareOnePassAnchoredToTheLatestStart() {
        var reconciliation = RealtimeReconciliation()
        reconciliation.streamStarted(reconciling: [.openTranscripts, .chatList])
        let between = reconciliation.beginRead()
        reconciliation.landed(.chatList, readStartedAt: between)
        reconciliation.streamStarted(reconciling: [.chatList])

        XCTAssertEqual(reconciliation.take(), [.openTranscripts, .chatList])
        XCTAssertEqual(reconciliation.take(), [], "one pass drains every pending start")
    }

    /// A reconnect after an earlier reconciliation anchors anew.
    func testEveryStartReconcilesNotOnlyTheFirst() {
        var reconciliation = RealtimeReconciliation()
        reconciliation.streamStarted(reconciling: [.chatList])
        let first = reconciliation.beginRead()
        XCTAssertEqual(reconciliation.take(), [.chatList])
        reconciliation.landed(.chatList, readStartedAt: first)

        reconciliation.streamStarted(reconciling: [.chatList])

        XCTAssertEqual(reconciliation.take(), [.chatList])
    }

    /// The foreground snapshot read can land after the start reconciliation's
    /// newer read: the older answer must write nothing.
    func testAnOlderReadLandingAfterANewerOneIsDropped() {
        var reconciliation = RealtimeReconciliation()
        let snapshot = reconciliation.beginRead()
        reconciliation.streamStarted(reconciling: [.chatList])
        let reconcile = reconciliation.beginRead()

        XCTAssertTrue(reconciliation.landed(.chatList, readStartedAt: reconcile))
        XCTAssertFalse(reconciliation.landed(.chatList, readStartedAt: snapshot))
        XCTAssertTrue(reconciliation.landed(.serverList, readStartedAt: snapshot), "projections are independent")
    }

    func testStoppingTheStreamsDropsPendingWork() {
        var reconciliation = RealtimeReconciliation()
        reconciliation.streamStarted(reconciling: [.chatList])
        reconciliation.cancelPending()

        XCTAssertEqual(reconciliation.take(), [])
    }
}
