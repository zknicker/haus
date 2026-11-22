import Foundation
import HausModels
import Testing
@testable import HausUI

@Suite struct WorkerViewRowTests {
    private let now = WorkerViewFixture.date(minutes: 30)
    private typealias Job = WorkerFixture.Job

    private func settled(_ status: String, turnStatus: String, minutes: Double = 28) throws -> Worker {
        try WorkerViewFixture.worker(
            status: status,
            runs: [WorkerFixture.run(status: turnStatus, terminalAt: WorkerViewFixture.at(minutes: minutes))],
            job: Job.ended("cancelled", settledAt: WorkerViewFixture.at(minutes: minutes))
        )
    }

    @Test func aRunningWorkerSaysHowLongItHasWorkedWhereAndForWhichTask() throws {
        let worker = try WorkerViewFixture.worker(runs: [
            WorkerFixture.run(status: "running", startedAt: WorkerViewFixture.at(minutes: 24)),
        ])

        let row = WorkerRowPresentation(worker: worker, taskKey: "HAUS-41", now: now)

        #expect(row.subtitle == "Working for 6m · mini · HAUS-41")
        #expect(row.glyph == .working)
        #expect(row.isLive)
    }

    @Test func aFinishedWorkerSumsItsTurns() throws {
        let worker = try WorkerViewFixture.worker(
            status: "done",
            runs: [
                WorkerFixture.run(
                    runId: "wkt_two",
                    startedAt: WorkerViewFixture.at(minutes: 20),
                    terminalAt: WorkerViewFixture.at(minutes: 26)
                ),
                WorkerFixture.run(runId: "wkt_one", terminalAt: WorkerViewFixture.at(minutes: 22)),
            ],
            job: Job.done(startedAt: WorkerFixture.start, settledAt: WorkerViewFixture.at(minutes: 26)),
            place: #"{"kind":"claude"}"#,
            runtime: nil
        )

        let row = WorkerRowPresentation(worker: worker, taskKey: "HAUS-39", now: now)

        #expect(row.subtitle == "Worked for 28m · Claude · HAUS-39")
        #expect(row.glyph == .finished)
        #expect(!row.isLive)
    }

    @Test func otherEndingsNameTheirState() throws {
        let needsYou = try settled("needs-you", turnStatus: "pending_input")
        let failed = try settled("failed", turnStatus: "failed")
        let stopped = try settled("stopped", turnStatus: "cancelled")
        let queued = try WorkerViewFixture.worker(status: "queued", runs: [WorkerFixture.run(status: "queued")])

        #expect(WorkerRowPresentation(worker: needsYou, now: now).subtitle == "Needs you · mini")
        #expect(WorkerRowPresentation(worker: failed, now: now).subtitle == "Failed · mini")
        #expect(WorkerRowPresentation(worker: stopped, now: now).subtitle == "Stopped · mini")
        #expect(WorkerRowPresentation(worker: queued, now: now).subtitle == "Starting · mini")
        #expect([needsYou, failed, stopped, queued].map { WorkerRowPresentation(worker: $0, now: now).glyph }
            == [.needsYou, .failed, .stopped, .working])
    }

    @Test func aTaskChatReportIsOneLineWithItsSpanAndPullRequests() throws {
        let branch = WorkerFixture.branch(url: "https://github.com/haus/haus/pull/443")
        let worker = try WorkerViewFixture.worker(
            status: "done",
            runs: [WorkerFixture.run(runId: "wkt_one", terminalAt: WorkerViewFixture.at(minutes: 14), branches: [branch])]
        )

        #expect(WorkerReportLinePresentation(worker: worker, turnId: "wkt_one")?.text
            == "Router seam finished, worked for 14m · 1 PR")
        #expect(WorkerReportLinePresentation(worker: worker, turnId: "wkt_missing") == nil)
    }

    @Test func reportLinesReadEachOutcome() {
        #expect(WorkerReportLinePresentation(title: nil, outcome: .finished, span: 840, pullRequestCount: 0).text
            == "Worker finished, worked for 14m")
        #expect(WorkerReportLinePresentation(title: "Fix", outcome: .needsYou, span: 1_020, pullRequestCount: 2).text
            == "Fix needs you, worked for 17m · 2 PRs")
        #expect(WorkerReportLinePresentation(title: "Fix", outcome: .failed, span: nil, pullRequestCount: 0).text
            == "Fix failed")
    }

    @Test func aLiveOrStoppedTurnHasNoReportLine() throws {
        let running = try WorkerViewFixture.worker(runs: [WorkerFixture.run(runId: "wkt_one", status: "running")])
        let stopped = try settled("stopped", turnStatus: "cancelled")

        #expect(WorkerReportLinePresentation(worker: running, turnId: "wkt_one") == nil)
        #expect(WorkerReportLinePresentation(worker: stopped, turnId: "car_one") == nil)
    }

    @Test func theShimmerSweepRepeats() {
        let start = Date(timeIntervalSinceReferenceDate: 0)

        #expect(WorkerShimmer.phase(at: start) == 0)
        #expect(abs(WorkerShimmer.phase(at: start.addingTimeInterval(0.9)) - 0.5) < 0.0001)
        #expect(WorkerShimmer.phase(at: start.addingTimeInterval(1.8)) < 0.0001)
    }
}
