import Foundation
import HausModels
import Testing
@testable import HausUI

/// How the Worker view reads a wire turn's input, steps, and outcome.
@Suite struct WorkerTurnRecordWireTests {
    private let now = WorkerViewFixture.date(minutes: 30)

    private func turn(
        id: String = "wkt_one",
        status: String,
        startedAt: Double = 0,
        terminalAt: Double? = 14,
        input: [String] = [],
        outcome: String = "null",
        steps: String? = nil,
        summary: String? = nil,
        branches: [String] = []
    ) -> String {
        let inputs = input.enumerated().map { index, text in
            #"{"at":"\#(WorkerViewFixture.at(minutes: Double(index)))","author":{"id":"agt_one","kind":"agent"},"kind":"\#(index == 0 ? "brief" : "follow-up")","messageId":null,"text":\#(WorkerFixture.quoted(text))}"#
        }
        return """
        {"acknowledgedAt":null,"branches":[\(branches.joined(separator: ","))],"createdAt":"\(WorkerFixture.start)",
         "dispatchedAt":null,"errorCode":null,"input":[\(inputs.joined(separator: ","))],
         "model":{"droppedParams":[],"fallbackFrom":null,"id":null,"params":[]},"outcome":\(outcome),
         "providerRunId":null,"rawStatus":null,"report":null,"startedAt":"\(WorkerViewFixture.at(minutes: startedAt))",
         "stall":null,"status":"\(status)",\(steps.map { #""steps":\#($0),"# } ?? "")"stopRequestedAt":null,
         "stopRequestedBy":null,"summary":\(summary.map(WorkerFixture.quoted) ?? "null"),
         "terminalAt":\(WorkerFixture.optional(terminalAt.map { WorkerViewFixture.at(minutes: $0) })),
         "turnId":"\(id)","usage":null}
        """
    }

    private func report(
        outcome: String = "done",
        text: String,
        ask: String? = nil,
        pullRequestUrls: [String] = []
    ) -> String {
        """
        {"kind":"report","report":{"ask":\(ask.map(WorkerFixture.quoted) ?? "null"),"messageId":"msg_report",
         "outcome":"\(outcome)","personId":null,"personRefused":null,
         "pullRequestUrls":[\(pullRequestUrls.map(WorkerFixture.quoted).joined(separator: ","))],
         "source":"worker","text":\(WorkerFixture.quoted(text))}}
        """
    }

    private static let steps = """
    [{"additions":null,"deletions":null,"kind":"read","label":"apps/ios/HausStore.swift","output":null,"state":"done"},
     {"additions":null,"deletions":null,"kind":"read","label":"apps/ios/HausRouter.swift","output":null,"state":"done"},
     {"additions":38,"deletions":6,"kind":"edit","label":"apps/ios/HausRouter.swift","output":null,"state":"done"},
     {"additions":null,"deletions":null,"kind":"run","label":"swift test","output":"Executed 12 tests","state":"done"},
     {"additions":null,"deletions":null,"kind":"search","label":"routeCase","output":null,"state":"running"}]
    """

    private func record(_ json: String) throws -> WorkerTurnRecord {
        let worker = try WorkerViewFixture.worker(runs: [json])
        return WorkerTurnRecord(turn: try #require(worker.runs.first))
    }

    @Test func promptsReadTheTurnInputInOrder() throws {
        let record = try record(turn(status: "running", terminalAt: nil, input: ["Add HausRouter.", "Also Servers."]))

        #expect(record.prompts == ["Add HausRouter.", "Also Servers."])
        #expect(record.isLive)
    }

    @Test func stepsKeepTheirPathCommandCountsAndOutput() throws {
        let record = try record(turn(status: "running", terminalAt: nil, steps: Self.steps))

        #expect(record.steps == [
            WorkerStepEntry(kind: .read, label: "apps/ios/HausStore.swift"),
            WorkerStepEntry(kind: .read, label: "apps/ios/HausRouter.swift"),
            WorkerStepEntry(kind: .edit, label: "apps/ios/HausRouter.swift", additions: 38, deletions: 6),
            WorkerStepEntry(kind: .run, label: "swift test", output: "Executed 12 tests"),
            WorkerStepEntry(kind: .search, label: "routeCase", state: .running),
        ])
        #expect(WorkerStepFold.groups(record.steps, live: true).map(\.title) == [
            "Read 2 files", "Edited HausRouter.swift", "Ran swift test", "Searching routeCase",
        ])
    }

    @Test func aReportReadsItsProseCitedFilesAndPullRequests() throws {
        let branch = WorkerFixture.branch(name: "claude/router", url: "https://github.com/haus/haus/pull/443")
        let text = """
        Router lands. Notes in [the write-up](drive://reports/router%20notes.md) and \
        [plan](drive://projects/HAUS/plan.md), again [here](drive://reports/router%20notes.md).
        ![diagram](drive://reports/diagram.png) and `[code](drive://reports/code.md)`
        """
        let record = try record(turn(
            status: "completed",
            outcome: report(text: text, pullRequestUrls: [
                "https://github.com/haus/haus/pull/443",
                "https://github.com/haus/api/pull/7",
            ]),
            summary: "Router lands.",
            branches: [branch]
        ))

        #expect(record.outcome == .finished)
        #expect(record.report == text)
        #expect(record.files == ["reports/router notes.md", "projects/HAUS/plan.md"])
        #expect(record.pullRequests.map(\.label) == ["haus#443", "api#7"])
        #expect(record.pullRequests.last?.url == URL(string: "https://github.com/haus/api/pull/7"))
    }

    @Test func aNeedsYouReportAddsItsAskOnce() throws {
        let worker = try record(turn(
            status: "pending_input",
            outcome: report(outcome: "needs-you", text: "Two ways to do this.", ask: "Which scope?")
        ))
        let provider = try record(turn(
            status: "pending_input",
            outcome: report(outcome: "needs-you", text: "Which scope?", ask: "Which scope?")
        ))

        #expect(worker.outcome == .needsYou)
        #expect(worker.report == "Two ways to do this.\n\nWhich scope?")
        #expect(provider.report == "Which scope?")
    }

    @Test func aFailedReportNamesNoReasonBecauseItsProseDoes() throws {
        let record = try record(turn(status: "failed", outcome: report(outcome: "failed", text: "Tests would not build.")))

        #expect(record.outcome == .failed(reason: nil))
        #expect(record.report == "Tests would not build.")
    }

    @Test func outcomesNobodyWroteShowTheirReasonAndNoReport() throws {
        let failed = try record(turn(
            status: "failed",
            outcome: #"{"detail":"exit 1","kind":"failed","reason":"machine-offline"}"#,
            summary: "Lost the Device."
        ))
        let stopped = try record(turn(status: "cancelled", outcome: #"{"kind":"stopped"}"#, summary: "Halted."))

        #expect(failed.outcome == .failed(reason: "The Device stayed offline during the turn"))
        #expect(failed.report == nil)
        #expect(stopped.outcome == .stopped)
        #expect(stopped.report == nil)
    }

    @Test func theWorkerViewShowsPromptsStepsReportAndCitations() throws {
        let worker = try WorkerViewFixture.worker(status: "done", runs: [
            turn(
                status: "completed",
                input: ["Add HausRouter."],
                outcome: report(text: "Router lands in [notes](drive://reports/router.md)."),
                steps: Self.steps.replacingOccurrences(of: #""state":"running""#, with: #""state":"done""#)
            ),
        ])

        let entries = WorkerThreadPresentation(worker: worker, now: now).entries.map(\.id)

        #expect(entries == [
            "wkt_one:prompt:0", "wkt_one:divider", "wkt_one:steps", "wkt_one:report",
            "wkt_one:citations", "wkt_one:settlement",
        ])
    }

    @Test(arguments: [
        ("drive://reports/a.md", "reports/a.md"),
        ("drive://reports/caf%C3%A9.md", "reports/café.md"),
        ("drive:///abs.md", nil),
        ("drive://reports/../secret.md", nil),
        ("drive://", nil),
        ("drive://reports/%E0%A4%A.md", nil),
        ("https://example.com/a.md", nil),
    ] as [(String, String?)])
    func driveTargetsReadAsRepoRelativePaths(_ target: String, path: String?) {
        #expect(WorkerDriveCitations.path(target: target) == path)
    }

    @Test(arguments: [
        ("https://github.com/haus/haus/pull/42", "haus/haus#42"),
        ("https://github.com/haus/haus/pull/42/files", "haus/haus#42"),
        ("https://github.com/haus/haus/issues/42", nil),
        ("ftp://github.com/haus/haus/pull/42", nil),
    ] as [(String, String?)])
    func reportPullRequestUrlsReadAsCitedPullRequests(_ url: String, id: String?) {
        #expect(WorkerCitedPullRequest(url: url)?.id == id)
    }
}
