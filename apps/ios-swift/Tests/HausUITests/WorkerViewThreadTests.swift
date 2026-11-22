import Foundation
import HausModels
import Testing
@testable import HausUI

@Suite struct WorkerViewThreadTests {
    private let now = WorkerViewFixture.date(minutes: 30)

    private func entryKinds(_ entries: [WorkerThreadEntry]) -> [String] {
        entries.map { entry in
            switch entry {
            case .prompt(_, let text): "prompt: \(text)"
            case .divider(_, let text, let live): "\(live ? "live " : "")divider: \(text)"
            case .steps(_, let groups): "steps: \(groups.map(\.title).joined(separator: ", "))"
            case .report(_, let text): "report: \(text)"
            case .citations(_, let pullRequests, let files):
                "citations: \((pullRequests.map(\.label) + files).joined(separator: ", "))"
            case .settlement(_, let text): "settlement: \(text)"
            }
        }
    }

    @Test func turnsReadOldestFirstAsPromptStepsReportAndSettlement() throws {
        let worker = try WorkerViewFixture.worker(runs: [])
        let pullRequest = WorkerCitedPullRequest(repository: "haus/haus", number: 443, state: .draft, url: nil)
        let turns = [
            WorkerTurnRecord(
                id: "wkt_two",
                prompts: ["Also switch Servers first."],
                steps: [
                    WorkerStepEntry(kind: .read, label: "HausStoreServerReload.swift"),
                    WorkerStepEntry(kind: .edit, label: "HausRouter+Servers.swift", state: .running),
                ],
                startedAt: WorkerViewFixture.date(minutes: 28),
                terminalAt: nil,
                outcome: nil
            ),
            WorkerTurnRecord(
                id: "wkt_one",
                prompts: ["Add HausRouter."],
                steps: (1...6).map { WorkerStepEntry(kind: .read, label: "f\($0).swift") },
                startedAt: WorkerViewFixture.date(minutes: 0),
                terminalAt: WorkerViewFixture.date(minutes: 14),
                outcome: .finished,
                report: "Router lands with 9 route cases.",
                pullRequests: [pullRequest],
                files: ["apps/ios-swift/HausRouter.swift"]
            ),
        ]

        let thread = WorkerThreadPresentation(worker: worker, turns: turns, taskKey: "HAUS-41", now: now)

        #expect(entryKinds(thread.entries) == [
            "prompt: Add HausRouter.",
            "divider: Worked for 14m",
            "steps: Read 6 files",
            "report: Router lands with 9 route cases.",
            "citations: haus#443, apps/ios-swift/HausRouter.swift",
            "settlement: Finished, worked for 14m",
            "prompt: Also switch Servers first.",
            "live divider: Working for 2m",
            "steps: Read HausStoreServerReload.swift, Editing HausRouter+Servers.swift",
        ])
        #expect(Set(thread.entries.map(\.id)).count == thread.entries.count)
    }

    @Test func thePlaceLineNamesTheDeviceTheHarnessAndTheTask() throws {
        let device = try WorkerViewFixture.worker(runs: [])
        let cloud = try WorkerViewFixture.worker(runs: [], place: #"{"kind":"cursor"}"#, runtime: nil)

        #expect(WorkerThreadPresentation(worker: device, taskKey: "HAUS-41", now: now).placeLine
            == "On mini · Claude Code · from HAUS-41")
        #expect(WorkerThreadPresentation(worker: cloud, now: now).placeLine == "On Cursor")
    }

    @Test func wireTurnsReadTheirSummaryAndPullRequestsWithoutSteps() throws {
        let branch = WorkerFixture.branch(
            name: "claude/router",
            url: "https://github.com/haus/haus/pull/443",
            snapshot: #"{"additions":38,"changedFiles":3,"deletions":612,"number":443,"state":"open","observedAt":"2026-09-04T12:14:00.000Z"}"#
        )
        let finished = WorkerFixture.run(
            runId: "wkt_one",
            status: "completed",
            terminalAt: WorkerViewFixture.at(minutes: 14),
            branches: [branch]
        ).replacingOccurrences(of: #""summary":null"#, with: #""summary":"Router lands.""#)
        let worker = try WorkerViewFixture.worker(status: "done", runs: [finished])

        let thread = WorkerThreadPresentation(worker: worker, now: now)

        #expect(entryKinds(thread.entries) == [
            "report: Router lands.",
            "citations: haus#443",
            "settlement: Finished, worked for 14m",
        ])
    }

    @Test func aLiveTurnWithoutStepsStillShowsItsShimmeringDivider() throws {
        let worker = try WorkerViewFixture.worker(runs: [
            WorkerFixture.run(status: "running", startedAt: WorkerViewFixture.at(minutes: 24)),
        ])
        let queued = try WorkerViewFixture.worker(status: "queued", runs: [WorkerFixture.run(status: "queued")])

        #expect(entryKinds(WorkerThreadPresentation(worker: worker, now: now).entries) == [
            "live divider: Working for 6m",
        ])
        #expect(entryKinds(WorkerThreadPresentation(worker: queued, now: now).entries) == ["live divider: Starting"])
    }

    @Test func settlementsNameHowEachTurnEnded() {
        #expect(WorkerThreadPresentation.settlementText(.finished, span: 840) == "Finished, worked for 14m")
        #expect(WorkerThreadPresentation.settlementText(.needsYou, span: 1_020) == "Needs you, worked for 17m")
        #expect(WorkerThreadPresentation.settlementText(.failed(reason: "Provider error"), span: nil)
            == "Failed: Provider error")
        #expect(WorkerThreadPresentation.settlementText(.stopped, span: 45) == "Stopped, worked for 45s")
    }

    @Test func aFailedWireTurnGivesItsReasonUnlessItReported() throws {
        let failed = try WorkerViewFixture.worker(status: "failed", runs: [
            WorkerFixture.run(status: "failed", terminalAt: WorkerViewFixture.at(minutes: 3))
                .replacingOccurrences(of: #""errorCode":null"#, with: #""errorCode":"provider-error""#),
        ])
        let reported = try WorkerViewFixture.worker(status: "failed", runs: [
            WorkerFixture.run(status: "failed", terminalAt: WorkerViewFixture.at(minutes: 3))
                .replacingOccurrences(of: #""summary":null"#, with: #""summary":"Tests would not build.""#),
        ])

        #expect(entryKinds(WorkerThreadPresentation(worker: failed, now: now).entries) == [
            "settlement: Failed: Provider error, worked for 3m",
        ])
        #expect(entryKinds(WorkerThreadPresentation(worker: reported, now: now).entries) == [
            "report: Tests would not build.",
            "settlement: Failed, worked for 3m",
        ])
    }

    @Test func durationsStayCoarse() {
        #expect(WorkerDuration.text(44.9) == "44s")
        #expect(WorkerDuration.text(14 * 60 + 59) == "14m")
        #expect(WorkerDuration.text(2 * 3600 + 5 * 60) == "2h 5m")
        #expect(WorkerDuration.text(26 * 3600) == "26h")
        #expect(WorkerDuration.text(-5) == "0s")
    }
}
