import Foundation
import HausModels
import Testing
@testable import HausUI

private typealias Fixture = CloudAgentWorkFixture
private typealias Job = CloudAgentWorkFixture.Job

/// Ports the App's `cloud-agent-status-line.test.ts`: one always-present line,
/// most urgent fact first.
@Suite struct CloudAgentStatusLineTests {
    private let now = Fixture.date("2026-09-04T12:10:00.000Z")

    private func minutesAgo(_ minutes: Int) -> String {
        Fixture.iso(now.addingTimeInterval(Double(-minutes * 60)))
    }

    private func line(_ agent: CloudAgentPresentation) -> CloudAgentStatusLine {
        agent.statusLine(agentName: "Blippy", at: now)
    }

    /// A follow-up queued 3 minutes ago behind an earlier Run that reads `job`.
    private func followedUp(_ job: (String) -> String, updatedAt: Int = 3) throws -> CloudAgentPresentation {
        try Fixture.work(
            status: "queued",
            job: job(Job.followUp("waiting", since: minutesAgo(3))),
            runs: [Fixture.run(runId: "car_two", status: "queued", createdAt: minutesAgo(3)), Fixture.run()],
            updatedAt: minutesAgo(updatedAt)
        )
    }

    @Test func aWorkingJobShowsItsLatestActivityAsOneFlatLine() throws {
        let agent = try Fixture.work(updatedAt: minutesAgo(1), activity: "### Now\nReading `migrations/003.sql`")
        #expect(line(agent) == CloudAgentStatusLine(text: "Now Reading migrations/003.sql", tone: .muted))
    }

    @Test func aWorkingJobWithNoActivitySaysWhenItLastUpdated() throws {
        #expect(line(try Fixture.work(updatedAt: minutesAgo(4))) == CloudAgentStatusLine(text: "Updated 4m ago", tone: .muted))
    }

    @Test func aFollowUpBehindAFinishedRunKeepsTheJobDoneAndNotesTheWait() throws {
        let agent = try followedUp { Job.done(startedAt: Fixture.start, settledAt: minutesAgo(5), followUp: $0) }
        #expect(agent.work.job.state == .done)
        #expect(line(agent) == CloudAgentStatusLine(text: "Blippy asked for changes · waiting 3m", tone: .muted))
    }

    @Test func aFollowUpQueuedWhileTheEarlierRunStillGoesReadsWorking() throws {
        let agent = try followedUp { Job.working(startedAt: Fixture.start, followUp: $0) }
        #expect(agent.work.job.state == .working)
        #expect(line(agent).text == "Blippy asked for changes · waiting 3m")
    }

    @Test func aRunningFollowUpSaysHowLongItHasRun() throws {
        let agent = try Fixture.work(
            job: Job.done(startedAt: Fixture.start, settledAt: Fixture.start,
                          followUp: Job.followUp("running", since: minutesAgo(2))),
            updatedAt: minutesAgo(1)
        )
        #expect(line(agent).text == "Blippy asked for changes · running 2m")
    }

    @Test func aFollowUpBehindAFailedRunKeepsTheFailureAndTheFailureWinsTheLine() throws {
        let agent = try followedUp {
            Job.failed(errorCode: "sample_build_failed", summary: "The **build** failed.", followUp: $0)
        }
        #expect(agent.work.job.state == .failed)
        #expect(line(agent) == CloudAgentStatusLine(text: "The build failed.", tone: .danger))
    }

    @Test func aFailureWithoutAReportReadsItsErrorCode() throws {
        let agent = try Fixture.work(status: "failed", job: Job.failed(errorCode: "sample_build_failed"))
        #expect(line(agent).text == "Sample build failed")
        #expect(line(try Fixture.work(status: "failed", job: Job.failed())).text == "The run failed without a reason")
    }

    @Test func aQuietLiveRunWarnsAheadOfTheFollowUpNote() throws {
        let agent = try followedUp(
            { Job.done(startedAt: Fixture.start, settledAt: minutesAgo(5), followUp: $0) }, updatedAt: 52
        )
        #expect(line(agent) == CloudAgentStatusLine(text: "No update in 52m", tone: .warning))
    }

    @Test func aRequestedStopShowsUntilTheRunSettles() throws {
        let agent = try Fixture.work(updatedAt: minutesAgo(1), cancelRequestedAt: minutesAgo(2))
        #expect(line(agent) == CloudAgentStatusLine(text: "Stopping · requested 2m ago", tone: .muted))
    }

    @Test func settledJobsSayWhenTheySettled() throws {
        let settled = minutesAgo(30)
        #expect(line(try Fixture.work(status: "completed", job: Job.done(startedAt: Fixture.start, settledAt: settled)))
            .text == "Finished 30m ago")
        #expect(line(try Fixture.work(status: "cancelled", job: Job.ended("cancelled", settledAt: settled)))
            .text == "Cancelled · 30m ago")
        #expect(line(try Fixture.work(status: "expired", job: Job.ended("expired", settledAt: settled)))
            .text == "Expired · 30m ago")
    }

    @Test func everyJobStateHasAStatusLine() throws {
        let jobs = [
            Job.working(startedAt: nil), Job.done(startedAt: nil, settledAt: nil), Job.failed(),
            Job.ended("cancelled", settledAt: nil), Job.ended("expired", settledAt: nil)
        ]
        for job in jobs {
            #expect(try !line(Fixture.work(job: job, updatedAt: minutesAgo(1))).text.isEmpty)
        }
    }
}
