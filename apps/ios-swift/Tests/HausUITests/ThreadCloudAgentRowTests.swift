import Foundation
import HausModels
import Testing
@testable import HausUI

private typealias Fixture = CloudAgentWorkFixture
private typealias Job = CloudAgentWorkFixture.Job

/// Ports the App's `thread-cloud-agent-row-model.test.ts`: one row per job,
/// in the order the jobs were started.
@Suite struct ThreadCloudAgentRowTests {
    private let now = Fixture.date("2026-09-04T12:10:00.000Z")

    private func minutesAgo(_ minutes: Int) -> String {
        Fixture.iso(now.addingTimeInterval(Double(-minutes * 60)))
    }

    @Test func everyJobGetsItsOwnRowInTheOrderTheJobsWereStarted() throws {
        let agents = try [
            Fixture.work(id: "a", title: "Third", status: "cancelled",
                         job: Job.ended("cancelled", settledAt: nil), createdAt: minutesAgo(10)),
            Fixture.work(id: "b", title: "First", status: "completed",
                         job: Job.done(startedAt: nil, settledAt: nil), createdAt: minutesAgo(30)),
            Fixture.work(id: "c", title: "Fifth", updatedAt: minutesAgo(1), createdAt: minutesAgo(5)),
            Fixture.work(id: "d", title: "Second", updatedAt: minutesAgo(52), createdAt: minutesAgo(20)),
            Fixture.work(id: "e", title: "Fourth", status: "failed", job: Job.failed(), createdAt: minutesAgo(8))
        ]
        #expect(ThreadCloudAgentRow.rows(agents, at: now).map(\.work.title)
            == ["First", "Second", "Third", "Fourth", "Fifth"])
    }

    @Test func jobsStartedAtTheSameMomentKeepTheServerOrder() throws {
        let agents = try [
            Fixture.work(id: "a", title: "Listed first", status: "completed", job: Job.done(startedAt: nil, settledAt: nil)),
            Fixture.work(id: "b", title: "Listed second", status: "failed", job: Job.failed())
        ]
        #expect(ThreadCloudAgentRow.rows(agents, at: now).map(\.work.title) == ["Listed first", "Listed second"])
    }

    @Test func aRowNeverMovesWhenItsJobChangesState() throws {
        let before = try [
            Fixture.work(id: "o", title: "Older", updatedAt: minutesAgo(1), createdAt: minutesAgo(20)),
            Fixture.work(id: "n", title: "Newer", updatedAt: minutesAgo(1), createdAt: minutesAgo(10))
        ]
        let after = try [
            Fixture.work(id: "n", title: "Newer", status: "failed", job: Job.failed(), createdAt: minutesAgo(10)),
            Fixture.work(id: "o", title: "Older", status: "completed",
                         job: Job.done(startedAt: nil, settledAt: nil), createdAt: minutesAgo(20))
        ]
        #expect(ThreadCloudAgentRow.rows(before, at: now).map(\.work.title) == ["Older", "Newer"])
        #expect(ThreadCloudAgentRow.rows(after, at: now).map(\.work.title) == ["Older", "Newer"])
    }

    @Test func aRowStatesTheJobInTheCardVocabularyNeverQueued() throws {
        let rows = ThreadCloudAgentRow.rows(try [
            Fixture.work(id: "a", status: "queued", job: Job.working(startedAt: minutesAgo(4)), updatedAt: minutesAgo(1)),
            Fixture.work(
                id: "b", status: "queued",
                job: Job.done(startedAt: nil, settledAt: nil, followUp: Job.followUp("waiting", since: minutesAgo(1))),
                updatedAt: minutesAgo(1)
            )
        ], at: now)
        #expect(rows.map(\.statusText) == ["Working · 4m", "Done"])
        #expect(rows.map(\.state) == [.working, .done])
    }

    @Test func aQuietLiveJobWarnsInsteadOfStatingItsState() throws {
        let row = try #require(ThreadCloudAgentRow.rows([try Fixture.work(updatedAt: minutesAgo(52))], at: now).first)
        #expect(row.statusText == "No update in 52m")
        #expect(row.tone == .warning)
    }

    @Test func aFailedJobIsNeverQuiet() throws {
        let row = try #require(ThreadCloudAgentRow.rows([
            try Fixture.work(status: "running", job: Job.failed(), updatedAt: minutesAgo(52))
        ], at: now).first)
        #expect(row.statusText == "Failed")
        #expect(row.tone == .standard)
    }

    @Test func aJobKeepsItsTitleAndGainsAPullRequestMarkerNeverTheDiff() throws {
        let snapshot = #"{"additions":10,"changedFiles":23,"deletions":0,"number":59,"observedAt":"\#(Fixture.start)","state":"open"}"#
        let agent = try Fixture.work(
            status: "completed", job: Job.done(startedAt: nil, settledAt: nil),
            runs: [Fixture.run(branches: [Fixture.branch(url: "https://github.com/haus/haus/pull/59", snapshot: snapshot)])]
        )
        let row = try #require(ThreadCloudAgentRow.rows([agent], at: now).first)
        #expect(row.work.title == "Fix the failing migration")
        #expect(row.pullRequestNumber == 59)
        #expect(!row.usesCompactCard)
    }

    // MARK: Stack

    private func fanOut() throws -> [CloudAgentPresentation] {
        let fresh = minutesAgo(1)
        return try [
            Fixture.work(id: "w1", title: "Working one", updatedAt: fresh),
            Fixture.work(id: "d", title: "Done", status: "completed", job: Job.done(startedAt: nil, settledAt: nil)),
            Fixture.work(id: "w2", title: "Working two", updatedAt: fresh),
            Fixture.work(id: "f", title: "Failed", status: "failed", job: Job.failed()),
            Fixture.work(id: "q", title: "Quiet", updatedAt: minutesAgo(52)),
            Fixture.work(id: "x", title: "Expired", status: "expired", job: Job.ended("expired", settledAt: nil))
        ]
    }

    @Test func theCountsLineStatesProblemsFirstAndTintsThem() throws {
        let stack = ThreadCloudAgentStack(try fanOut(), at: now)
        #expect(stack.title == "6 cloud agents")
        #expect(stack.countsText == "1 failed · 1 no update · 2 working · 1 done · 1 expired")
        #expect(stack.counts.map(\.tone) == [.danger, .warning, .standard, .standard, .standard])
    }

    @Test func theFirstFailedJobLeadsTheStack() throws {
        #expect(ThreadCloudAgentStack(try fanOut(), at: now).top?.work.title == "Failed")
    }

    @Test func withoutAFailureTheFirstQuietJobLeadsTheStack() throws {
        let agents = try [
            Fixture.work(id: "w", title: "Working", updatedAt: minutesAgo(1)),
            Fixture.work(id: "q1", title: "Quiet one", updatedAt: minutesAgo(52)),
            Fixture.work(id: "q2", title: "Quiet two", updatedAt: minutesAgo(52))
        ]
        #expect(ThreadCloudAgentStack(agents, at: now).top?.work.title == "Quiet one")
    }

    @Test func aCalmStackIsLedByTheFirstJobStarted() throws {
        let calm = try [
            Fixture.work(id: "w", title: "Working", updatedAt: minutesAgo(1), createdAt: minutesAgo(5)),
            Fixture.work(id: "d", title: "Done", status: "completed",
                         job: Job.done(startedAt: nil, settledAt: nil), createdAt: minutesAgo(9))
        ]
        #expect(ThreadCloudAgentStack(calm, at: now).top?.work.title == "Done")
    }

    @Test func peeksFollowTheStartOrderLeavingOutTheTopCard() throws {
        let stack = ThreadCloudAgentStack(try fanOut(), at: now)
        #expect(stack.peeks.map(\.work.title) == ["Working one", "Done"])
        #expect(stack.rows.map(\.work.title)
            == ["Working one", "Done", "Working two", "Failed", "Quiet", "Expired"])
    }

    @Test func aSingleJobIsJustItsCard() throws {
        let stack = ThreadCloudAgentStack([try Fixture.work(updatedAt: minutesAgo(1))], at: now)
        #expect(stack.isSingle)
        #expect(stack.peekCount == 0)
        #expect(!ThreadCloudAgentStack(try fanOut(), at: now).isSingle)
    }

    @Test func atMostTwoEdgesPeekUnderTheTopCard() throws {
        let jobs = try fanOut()
        #expect(ThreadCloudAgentStack(Array(jobs.prefix(1)), at: now).peekCount == 0)
        #expect(ThreadCloudAgentStack(Array(jobs.prefix(2)), at: now).peekCount == 1)
        #expect(ThreadCloudAgentStack(Array(jobs.prefix(3)), at: now).peekCount == 2)
        #expect(ThreadCloudAgentStack(jobs, at: now).peekCount == 2)
        #expect(ThreadCloudAgentStack([], at: now).peekCount == 0)
    }

    @Test func onlyACalmWorkingJobWithoutAPullRequestCollapsesToItsHeader() throws {
        let rows = ThreadCloudAgentStack(try fanOut(), at: now).rows
        #expect(rows.filter(\.usesCompactCard).map(\.work.title) == ["Working one", "Working two"])
    }
}

@MainActor
@Suite struct ThreadCloudAgentStackExpansionTests {
    @Test func aStackStartsCollapsedAndRemembersItsExpansionPerThread() {
        let expansion = ThreadCloudAgentStackExpansion()
        #expect(!expansion.isExpanded(anchorMessageID: "msg_a"))

        expansion.setExpanded(true, anchorMessageID: "msg_a")
        #expect(expansion.isExpanded(anchorMessageID: "msg_a"))
        #expect(!expansion.isExpanded(anchorMessageID: "msg_b"))

        expansion.setExpanded(false, anchorMessageID: "msg_a")
        #expect(!expansion.isExpanded(anchorMessageID: "msg_a"))
    }
}
