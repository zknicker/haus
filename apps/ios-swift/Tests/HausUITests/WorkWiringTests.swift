import Foundation
import HausModels
import Testing
@testable import HausUI

struct WorkPillStateTests {
    @Test func countsRunningWorkersAndOpenPullRequests() throws {
        let content = WorkViewContent(
            workers: [
                try WorkFixture.item(id: "w1", job: .working),
                try WorkFixture.item(id: "w2", job: .needsInput),
                try WorkFixture.item(id: "w3", job: .done),
            ],
            pullRequests: [
                PullRequestFixture.presentation(number: 1),
                PullRequestFixture.presentation(number: 2, state: "draft"),
                PullRequestFixture.presentation(number: 3, state: "merged"),
            ],
            files: []
        )
        let pill = WorkPillState(content: content, now: WorkFixture.start)
        #expect(pill.count == 4)
        #expect(pill.isVisible)
    }

    @Test func aPlaceWithNoWorkShowsNoPill() {
        let pill = WorkPillState(content: WorkViewContent(workers: [], pullRequests: [], files: []), now: WorkFixture.start)
        #expect(pill.count == 0)
        #expect(!pill.isVisible)
    }

    @Test func finishedWorkStaysForADayThenTheZeroCountPillGoes() throws {
        let content = WorkViewContent(workers: [try WorkFixture.item(id: "w1", job: .done)], pullRequests: [], files: [])
        let recent = WorkPillState(content: content, now: WorkFixture.start.addingTimeInterval(60 * 60))
        #expect(recent == WorkPillState(count: 0, isVisible: true))
        let stale = WorkPillState(content: content, now: WorkFixture.start.addingTimeInterval(WorkPillState.recentWindow + 1))
        #expect(!stale.isVisible)
    }
}

@MainActor
struct WorkReferenceRouteTests {
    @Test func aWorkerReferenceOpensItsWorker() throws {
        let reference = RichReferencePresentation(id: "wrk_1", kind: .cloudAgentWork, label: "Router seam", avatarURL: nil)
        let url = try #require(reference.activationURL)
        var opened: String?
        InAppReferenceRoutes.openWorker = { opened = $0 }
        defer { InAppReferenceRoutes.openWorker = nil }

        #expect(InAppReferenceRoutes.handle(url))
        #expect(opened == "wrk_1")
    }

    @Test func aPullRequestTheAppHoldsOpensNatively() throws {
        let url = try #require(URL(string: "https://github.com/haus/haus/pull/441"))
        var opened = false
        InAppReferenceRoutes.openPullRequest = { _ in { opened = true } }
        defer { InAppReferenceRoutes.openPullRequest = nil }

        #expect(InAppReferenceRoutes.handle(url))
        #expect(opened)
    }

    @Test func aPullRequestTheAppDoesNotHoldGoesToTheBrowser() throws {
        let url = try #require(URL(string: "https://github.com/haus/haus/pull/441"))
        InAppReferenceRoutes.openPullRequest = { _ in nil }
        defer { InAppReferenceRoutes.openPullRequest = nil }

        #expect(!InAppReferenceRoutes.handle(url))
        #expect(InAppReferenceRoutes.action(for: try #require(URL(string: "https://example.com/pull"))) == nil)
    }
}

struct PullRequestLookupTests {
    @Test func findsAReadingByItsAddressOrItsRepositoryAndNumber() throws {
        let known = [PullRequestFixture.presentation(number: 441), PullRequestFixture.presentation(number: 443)]
        let exact = try #require(URL(string: "https://github.com/haus/haus/pull/443"))
        let deep = try #require(URL(string: "https://github.com/Haus/haus/pull/441/files"))
        let unknown = try #require(URL(string: "https://github.com/haus/haus/pull/9"))

        #expect(PullRequestLookup.find(url: exact, in: known)?.reading.number == 443)
        #expect(PullRequestLookup.find(url: deep, in: known)?.reading.number == 441)
        #expect(PullRequestLookup.find(url: unknown, in: known) == nil)
    }

    @Test func findsACitedPullRequest() {
        let known = [PullRequestFixture.presentation(number: 441)]
        let cited = WorkerCitedPullRequest(repository: "haus/haus", number: 441, state: .open, url: nil)
        #expect(PullRequestLookup.find(cited: cited, in: known)?.id == "haus/haus#441")
    }
}

struct MessageWorkerReportTests {
    @Test func aReportReadsItsOutcomeWhenTheWorkerIsUnknown() {
        let report = MessageWorkerReport(workerID: "wrk_1", turnID: "wkt_1", outcome: .needsYou, worker: nil)
        #expect(report.workerID == "wrk_1")
        #expect(report.line.text == "Worker needs you")
    }

    @Test func aReportWhoseTurnIsUnsettledFallsBackToItsOutcomeAndTitle() throws {
        let worker = try WorkFixture.worker(id: "w1", job: .done).work
        let report = MessageWorkerReport(workerID: "w1", turnID: "run_missing", outcome: .done, worker: worker)
        #expect(report.line.text == "Raise minimum to iOS 26 finished")
    }
}
