import Foundation
import HausModels
import Testing
@testable import HausUI

private typealias Fixture = CloudAgentWorkFixture
private typealias Job = CloudAgentWorkFixture.Job

/// Ports the App's `cloud-agent-presentation.test.ts`: the headline reads the
/// Server's `job`, never the newest Run.
@Suite struct CloudAgentPresentationTests {
    private let now = Fixture.date("2026-09-04T12:04:00.000Z")

    @Test func aJobWhoseFirstRunIsStillQueuedReadsAsWorkingNeverQueued() throws {
        let agent = try Fixture.work(status: "queued", job: Job.working(startedAt: nil))
        #expect(agent.jobText(at: now) == "Working")
    }

    @Test func aWorkingJobCountsUpFromWhenTheProviderStartedIt() throws {
        #expect(try Fixture.work().jobText(at: now) == "Working · 4m")
        let start = Fixture.date(Fixture.start)
        for (minutes, text) in [(59, "Working · 59m"), (60, "Working · 1h"), (119, "Working · 1h 59m"),
                                (27 * 60 + 5, "Working · 27h 5m")] {
            #expect(try Fixture.work().jobText(at: start.addingTimeInterval(Double(minutes * 60))) == text)
        }
    }

    @Test func aDoneJobStatesHowLongItTookNotHowLongAgo() throws {
        let agent = try Fixture.work(
            status: "completed", job: Job.done(startedAt: Fixture.start, settledAt: "2026-09-04T13:12:00.000Z")
        )
        #expect(agent.jobText(at: now) == "Done · 1h 12m")
    }

    @Test func aFollowUpQueuedBehindAFinishedRunKeepsTheJobDone() throws {
        let agent = try Fixture.work(
            status: "queued",
            job: Job.done(
                startedAt: Fixture.start, settledAt: "2026-09-04T12:02:00.000Z",
                followUp: Job.followUp("waiting", since: "2026-09-04T12:03:00.000Z")
            ),
            runs: [Fixture.run(runId: "car_two", status: "queued"), Fixture.run(terminalAt: Fixture.start)]
        )
        #expect(agent.work.job.state == .done)
        #expect(agent.jobText(at: now) == "Done · 2m")
    }

    @Test func failedCancelledAndExpiredNameOnlyTheirOutcome() throws {
        #expect(try Fixture.work(status: "failed", job: Job.failed()).jobText(at: now) == "Failed")
        #expect(try Fixture.work(status: "expired", job: Job.ended("expired", settledAt: Fixture.start))
            .jobText(at: now) == "Expired")
        #expect(try Fixture.work(status: "cancelled", job: Job.ended("cancelled", settledAt: Fixture.start))
            .jobText(at: now) == "Cancelled")
    }

    @Test func anyLiveRunThatHasNotReportedForTenMinutesReadsAsQuiet() throws {
        let quietAt = "2026-09-04T11:50:00.000Z"
        #expect(try Fixture.work(updatedAt: quietAt).quietFor(at: now) == 14 * 60)
        // A follow-up waiting in the queue is live too.
        #expect(try Fixture.work(status: "queued", updatedAt: quietAt).quietFor(at: now) == 14 * 60)
        #expect(try Fixture.work(updatedAt: "2026-09-04T12:03:00.000Z").quietFor(at: now) == nil)
        // A settled work is not quiet; it is finished.
        #expect(try Fixture.work(status: "completed", updatedAt: quietAt).quietFor(at: now) == nil)
    }

    @Test func onlyALiveUncancelledRunCanBeCancelled() throws {
        #expect(try Fixture.work().canBeCancelled)
        #expect(try !Fixture.work(status: "completed").canBeCancelled)
        #expect(try !Fixture.work(cancelRequestedAt: Fixture.start).canBeCancelled)
    }

    @Test func durationsReadCoarsely() {
        #expect(CloudAgentPresentation.duration(seconds: -5) == "0s")
        #expect(CloudAgentPresentation.duration(seconds: 42) == "42s")
        #expect(CloudAgentPresentation.duration(seconds: 11 * 60) == "11m")
        #expect(CloudAgentPresentation.duration(seconds: 60 * 60) == "1h")
        #expect(CloudAgentPresentation.duration(seconds: 150 * 60) == "2h 30m")
    }

    @Test func theBranchThatOpenedAPullRequestWins() throws {
        let agent = try Fixture.work(runs: [Fixture.run(branches: [
            Fixture.branch(name: "cursor/spike", url: nil), Fixture.branch()
        ])])
        #expect(agent.branch?.branch == "cursor/fix-migration")
        #expect(agent.pullRequestURL?.absoluteString == "https://github.com/haus/haus/pull/482")
    }

    @Test func aWorkWhoseBranchesOpenedNothingStillNamesTheFirstAndHasNoPullRequest() throws {
        let agent = try Fixture.work(runs: [Fixture.run(branches: [Fixture.branch(name: "cursor/spike", url: nil)])])
        #expect(agent.branch?.branch == "cursor/spike")
        #expect(agent.pullRequestNumber == nil)
        #expect(try Fixture.work().branch == nil)
    }

    @Test func aFollowUpRunThatReportedNothingYetKeepsTheEarlierPullRequest() throws {
        let agent = try Fixture.work(
            status: "queued",
            runs: [Fixture.run(runId: "car_two", status: "queued"), Fixture.run(branches: [Fixture.branch()])]
        )
        #expect(agent.branch?.branch == "cursor/fix-migration")
        #expect(agent.pullRequestNumber == 482)
    }

    @Test func aBranchNamesItsPullRequestFromTheSnapshotThenItsURL() throws {
        let snapshot = #"{"additions":5743,"changedFiles":47,"deletions":2,"number":481,"observedAt":"\#(Fixture.start)","state":"open"}"#
        #expect(try Fixture.work(runs: [Fixture.run(branches: [Fixture.branch(snapshot: snapshot)])]).pullRequestNumber == 481)
        #expect(try Fixture.work(runs: [Fixture.run(branches: [Fixture.branch()])]).pullRequestNumber == 482)
        let gitlab = Fixture.branch(url: "https://gitlab.com/haus/haus/-/merge_requests/7")
        let unparsed = try Fixture.work(runs: [Fixture.run(branches: [gitlab])])
        #expect(unparsed.pullRequestNumber == nil)
        #expect(unparsed.pullRequestURL != nil)
    }

    @Test func threadPreviewNeverRepeatsTheAnchorsOwnWork() throws {
        let own = try Fixture.work(id: "work-1").work
        let encoded = String(decoding: try HausJSON.encoder().encode(own), as: UTF8.self)
        let inner = encoded.replacingOccurrences(of: #""id":"work-1""#, with: #""id":"work-2""#)
        let rows = try HausJSON.decoder().decode([ThreadCloudAgentWork].self, from: Data("""
        [{"anchorMessageId":"delegation-1","work":\(encoded)},
         {"anchorMessageId":"delegation-1","work":\(inner)},
         {"anchorMessageId":"other-anchor","work":\(inner)}]
        """.utf8))
        let listed = CloudAgentPresentation.threadPreviewWork(rows, anchorMessageID: "delegation-1", ownWorkID: own.id)
        #expect(listed.map(\.id) == ["work-2"])
        #expect(CloudAgentPresentation.threadPreviewWork(rows, anchorMessageID: "delegation-1", ownWorkID: nil).count == 2)
    }

    @Test func onlyWebDestinationsCanBeOpened() {
        #expect(CloudAgentPresentation.externalURL("https://github.com/zknicker/haus/pull/112") != nil)
        #expect(CloudAgentPresentation.externalURL("javascript:alert(1)") == nil)
        #expect(CloudAgentPresentation.externalURL("file:///etc/passwd") == nil)
        #expect(CloudAgentPresentation.externalURL("/relative") == nil)
    }

    @Test func typedBodyCarriesTheCardAndUnknownKindsKeepTheirProse() throws {
        let work = try Fixture.work(
            status: "failed", job: Job.failed(errorCode: "build", summary: "Broke", followUp: Job.followUp("running", since: Fixture.start))
        ).work
        let body = ChatMessageBody.cloudAgentWork(work)
        let encoded = try HausJSON.encoder().encode(body)
        #expect(try HausJSON.decoder().decode(ChatMessageBody.self, from: encoded) == body)
        let unknown = Data(#"{"kind":"future-body","details":{"anything":true}}"#.utf8)
        #expect(try HausJSON.decoder().decode(ChatMessageBody.self, from: unknown) == .unsupported("future-body"))
    }

    @Test func theJobAndRunCreatedAtAreRequiredOnTheWire() throws {
        let valid = try HausJSON.encoder().encode(try Fixture.work().work)
        var object = try #require(try JSONSerialization.jsonObject(with: valid) as? [String: Any])
        #expect(object.removeValue(forKey: "job") != nil)
        let withoutJob = try JSONSerialization.data(withJSONObject: object)
        #expect(throws: DecodingError.self) {
            try HausJSON.decoder().decode(CloudAgentWork.self, from: withoutJob)
        }
        let runWithoutCreatedAt = Fixture.run()
            .replacingOccurrences(of: #""createdAt":"\#(Fixture.start)","#, with: "")
        #expect(throws: DecodingError.self) { try Fixture.work(runs: [runWithoutCreatedAt]) }
        // A follow-up's state outside the contract is rejected, not guessed.
        #expect(throws: DecodingError.self) {
            try Fixture.work(job: Job.working(startedAt: nil, followUp: Job.followUp("queued", since: Fixture.start)))
        }
    }

    @Test func cloudUpdateDecodesAndReplaysWithoutBreakingChatStream() throws {
        let json = """
        {"type":"cloud-agent-work.updated","cloudAgentWorkId":"work-1",
         "chatId":"thread-1","parentChatId":"channel-1","messageId":"delegation-1",
         "serverId":"server-1","id":"event-1","sequence":8,"cursor":"9",
         "createdAt":"2026-09-07T18:00:00.000Z"}
        """
        let event = try HausJSON.decoder().decode(ChatEvent.self, from: Data(json.utf8))
        #expect(event.type == .cloudAgentWorkUpdated)
        #expect(event.chatID == "thread-1")
        #expect(event.parentChatID == "channel-1")
        var replay = ChatEventReplayState()
        let firstDelivery = replay.receive(event)
        let repeatedDelivery = replay.receive(event)
        #expect(firstDelivery)
        #expect(!repeatedDelivery)
    }
}
