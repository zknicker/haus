import Foundation
import XCTest
@testable import HausModels

final class RealtimeStreamRestartsTests: XCTestCase {
    private let start = Date(timeIntervalSince1970: 1_000)

    /// The iPhone's focused subscriptions, `taskLabel.onUpdated` and the
    /// `server.onUpdated` membership sentinel included.
    func testTheIPhoneSubscribesToEveryFocusedChatStream() {
        XCTAssertEqual(Set(RealtimeStream.allCases.map(\.path)), [
            "chat.onMessageCreated", "chat.onMessageReactionUpdated", "chat.onRead",
            "thread.onFollowUpdated", "chat.onLifecycle", "cloudAgentWork.onUpdated",
            "task.onChanged", "taskLabel.onUpdated", "agent.onLifecycle", "agent.onActivity",
            "server.onUpdated",
        ])
    }

    /// Departures publish `server.updated`, so the sentinel ends with the
    /// coded refusal, which runs the Server's membership-loss purge.
    func testTheSentinelsMembershipRefusalPurgesTheServer() {
        var restarts = RealtimeStreamRestarts()
        _ = restarts.connected(.serverUpdated, at: start)
        XCTAssertEqual(restarts.ended(.serverUpdated, by: .refused(.membershipLost), at: start + 1), .membershipLost)
        XCTAssertEqual(RealtimeStream.serverUpdated.ownedProjections, [.serverList])
        XCTAssertFalse(RealtimeStream.serverUpdated.reportsOutage)
    }

    /// One stream failing restarts that stream alone: its siblings keep their
    /// backoff and are never asked to restart.
    func testOneStreamsFailureRestartsOnlyThatStream() {
        var restarts = RealtimeStreamRestarts()
        for stream in RealtimeStream.allCases {
            XCTAssertFalse(restarts.connected(stream, at: start))
        }

        XCTAssertEqual(
            restarts.ended(.messageCreated, by: .failed, at: start + 1),
            .restart(after: .seconds(1), reauthenticate: false)
        )
        XCTAssertEqual(
            restarts.ended(.messageCreated, by: .failed, at: start + 2),
            .restart(after: .seconds(2), reauthenticate: false)
        )
        // A sibling's first failure starts from its own first step.
        XCTAssertEqual(
            restarts.ended(.taskLabelUpdated, by: .failed, at: start + 3),
            .restart(after: .seconds(1), reauthenticate: false)
        )
        XCTAssertFalse(restarts.allRunning)
    }

    func testANormalCompletionRestartsLikeAnError() {
        var restarts = RealtimeStreamRestarts()
        _ = restarts.connected(.chatRead, at: start)
        XCTAssertEqual(restarts.ended(.chatRead, by: .completed, at: start + 1), .restart(after: .seconds(1), reauthenticate: false))
    }

    func testBackoffIsCappedAtThirtySecondsAndResetsAfterAStableConnection() {
        var restarts = RealtimeStreamRestarts()
        var last: RealtimeStreamDecision?
        for _ in 0..<10 {
            last = restarts.ended(.chatLifecycle, by: .failed, at: start)
        }
        XCTAssertEqual(last, .restart(after: .seconds(30), reauthenticate: false))

        _ = restarts.connected(.chatLifecycle, at: start)
        XCTAssertEqual(
            restarts.ended(.chatLifecycle, by: .failed, at: start + RealtimeStreamRestarts.stableInterval),
            .restart(after: .seconds(1), reauthenticate: false)
        )
    }

    func testAConnectAfterTheFirstIsARestart() {
        var restarts = RealtimeStreamRestarts()
        XCTAssertFalse(restarts.connected(.messageCreated, at: start))
        _ = restarts.ended(.messageCreated, by: .failed, at: start + 1)
        XCTAssertTrue(restarts.connected(.messageCreated, at: start + 2))
        XCTAssertTrue(restarts.allRunning)
    }

    // MARK: - Start reconciliation

    /// Recovery is anchored to the subscription start: the first start
    /// reconciles too, not only a restart.
    func testEveryStartReconcilesWhatTheStreamOwns() {
        for stream in RealtimeStream.allCases where stream != .messageCreated {
            XCTAssertEqual(stream.startReconciliation(isRestart: false), stream.ownedProjections, stream.path)
            XCTAssertEqual(stream.startReconciliation(isRestart: true), stream.ownedProjections, stream.path)
        }
    }

    /// The message stream keeps its cheap tail path on every start; only a
    /// restart of it reloads transcripts in bulk.
    func testTheMessageStreamTailsOnEveryStartAndReloadsInBulkOnlyOnRestart() {
        XCTAssertEqual(Set(RealtimeStream.allCases.filter(\.tailsLoadedListsOnStart)), [.messageCreated])
        XCTAssertEqual(RealtimeStream.messageCreated.startReconciliation(isRestart: false), [.chatList])
        XCTAssertEqual(
            RealtimeStream.messageCreated.startReconciliation(isRestart: true),
            [.openTranscripts, .chatList]
        )
    }

    /// The annotation streams starting beside the message stream cover open
    /// transcripts on a launch or foreground.
    func testAFirstStartOfEveryStreamCoversOpenTranscripts() {
        let union = RealtimeStream.allCases.reduce(into: Set<RealtimeProjection>()) {
            $0.formUnion($1.startReconciliation(isRestart: false))
        }
        XCTAssertEqual(union, Set(RealtimeProjection.allCases))
    }

    // MARK: - Refusal classes

    func testMembershipLossIsFinalForTheServer() {
        var restarts = RealtimeStreamRestarts()
        XCTAssertEqual(restarts.ended(.chatRead, by: .refused(.membershipLost), at: start), .membershipLost)
    }

    func testARoleRefusalStopsOnlyThatStream() {
        var restarts = RealtimeStreamRestarts()
        XCTAssertEqual(restarts.ended(.taskChanged, by: .refused(.roleRequired), at: start), .stop)
        XCTAssertEqual(
            restarts.ended(.chatRead, by: .failed, at: start),
            .restart(after: .seconds(1), reauthenticate: false)
        )
    }

    func testAnUnauthorizedEndReauthenticatesAndRetries() {
        var restarts = RealtimeStreamRestarts()
        XCTAssertEqual(
            restarts.ended(.messageCreated, by: .unauthorized, at: start),
            .restart(after: .seconds(1), reauthenticate: true)
        )
        XCTAssertEqual(
            restarts.ended(.messageCreated, by: .unauthorized, at: start),
            .restart(after: .seconds(2), reauthenticate: true)
        )
    }

    // MARK: - Owned projections

    /// A restart reloads only what that stream keeps fresh.
    func testEachStreamReloadsOnlyItsOwnProjections() {
        let transcriptStreams: [RealtimeStream] = [.messageCreated, .messageReactionUpdated, .chatRead, .threadFollowUpdated]
        for stream in transcriptStreams {
            XCTAssertEqual(stream.ownedProjections, [.openTranscripts, .chatList], stream.path)
        }
        XCTAssertEqual(RealtimeStream.taskChanged.ownedProjections, [.openTranscripts, .chatList, .taskLenses])
        // Labels are embedded in transcript entities, so label recovery
        // includes open transcript lists.
        XCTAssertEqual(RealtimeStream.taskLabelUpdated.ownedProjections, [.openTranscripts, .taskLenses])
        XCTAssertEqual(
            RealtimeStream.cloudAgentWorkUpdated.ownedProjections,
            [.openTranscripts, .chatList, .activeCloudAgentWork]
        )
        XCTAssertEqual(RealtimeStream.chatLifecycle.ownedProjections, [.chatList])
        XCTAssertEqual(RealtimeStream.agentLifecycle.ownedProjections, [.agentAvailability])
        XCTAssertEqual(RealtimeStream.agentActivity.ownedProjections, [.agentActivity])
    }

    func testOnlyMessagesAndPresenceReportAnOutage() {
        XCTAssertEqual(
            Set(RealtimeStream.allCases.filter(\.reportsOutage)),
            [.messageCreated, .agentLifecycle]
        )
    }
}
