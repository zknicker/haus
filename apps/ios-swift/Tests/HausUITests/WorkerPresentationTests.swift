import Foundation
import HausModels
import Testing
@testable import HausUI

private typealias Fixture = WorkerFixture
private typealias Job = WorkerFixture.Job

/// Ports the App's `cloud-agent-presentation.test.ts`: durations, branches,
/// and the wire shape of a Worker.
@Suite struct WorkerPresentationTests {
    @Test func durationsReadCoarsely() {
        #expect(WorkerPresentation.duration(seconds: -5) == "0s")
        #expect(WorkerPresentation.duration(seconds: 42) == "42s")
        #expect(WorkerPresentation.duration(seconds: 11 * 60) == "11m")
        #expect(WorkerPresentation.duration(seconds: 60 * 60) == "1h")
        #expect(WorkerPresentation.duration(seconds: 150 * 60) == "2h 30m")
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

    @Test func onlyWebDestinationsCanBeOpened() {
        #expect(WorkerPresentation.externalURL("https://github.com/zknicker/haus/pull/112") != nil)
        #expect(WorkerPresentation.externalURL("javascript:alert(1)") == nil)
        #expect(WorkerPresentation.externalURL("file:///etc/passwd") == nil)
        #expect(WorkerPresentation.externalURL("/relative") == nil)
    }

    @Test func workIsNeverABodyAndUnknownKindsKeepTheirProse() throws {
        let retired = Data(#"{"kind":"cloud-agent-work","work":{}}"#.utf8)
        #expect(try HausJSON.decoder().decode(ChatMessageBody.self, from: retired) == .unsupported("cloud-agent-work"))
        let unknown = Data(#"{"kind":"future-body","details":{"anything":true}}"#.utf8)
        #expect(try HausJSON.decoder().decode(ChatMessageBody.self, from: unknown) == .unsupported("future-body"))
    }

    @Test func theJobAndRunCreatedAtAreRequiredOnTheWire() throws {
        let valid = try HausJSON.encoder().encode(try Fixture.work().work)
        var object = try #require(try JSONSerialization.jsonObject(with: valid) as? [String: Any])
        #expect(object.removeValue(forKey: "job") != nil)
        let withoutJob = try JSONSerialization.data(withJSONObject: object)
        #expect(throws: DecodingError.self) {
            try HausJSON.decoder().decode(Worker.self, from: withoutJob)
        }
        let runWithoutCreatedAt = Fixture.run()
            .replacingOccurrences(of: #""createdAt":"\#(Fixture.start)","#, with: "")
        #expect(throws: DecodingError.self) { try Fixture.work(runs: [runWithoutCreatedAt]) }
        // A follow-up's state outside the contract is rejected, not guessed.
        #expect(throws: DecodingError.self) {
            try Fixture.work(job: Job.working(startedAt: nil, followUp: Job.followUp("queued", since: Fixture.start)))
        }
    }

    @Test
    func liveReadingOutlivesTheRunSnapshot() throws {
        let reading = #"""
        {"additions":90,"changedFiles":7,"checks":"passing","deletions":5,"headSha":"abc123",
         "number":482,"observedAt":"2026-11-05T12:00:00.000Z","repository":"haus/haus",
         "review":"approved","settledAt":"2026-11-05T12:00:00.000Z","source":"github",
         "state":"merged","title":"Fix it","url":"https://github.com/haus/haus/pull/482"}
        """#
        let agent = try WorkerFixture.work(pullRequest: reading)
        #expect(agent.pullRequest?.state == "merged")
        #expect(agent.pullRequest?.changedFiles == 7)
    }
}
