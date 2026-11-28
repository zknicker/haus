import Foundation
import HausModels
import SwiftUI
import Testing
@testable import HausUI

struct PullRequestGroupTests {
    @Test(arguments: [
        ("draft", "pending", PullRequestGroup.draft),
        ("draft", "passing", .draft),
        ("open", "pending", .waitingOnChecks),
        ("open", "failing", .waitingOnChecks),
        ("open", "passing", .ready),
        ("open", "none", .ready),
        ("open", "unknown", .ready),
    ])
    func openReadingsGroupByStateAndChecks(state: String, checks: String, group: PullRequestGroup) {
        #expect(PullRequestGroup(state: state, checks: checks) == group)
    }

    @Test(arguments: ["merged", "closed"])
    func settledReadingsSitInNoGroup(state: String) {
        #expect(PullRequestGroup(state: state, checks: "passing") == nil)
    }

    @Test func listedOrdersReadyThenWaitingThenDraftAndDropsSettled() {
        let pullRequests = [
            PullRequestFixture.presentation(number: 1, state: "draft"),
            PullRequestFixture.presentation(number: 2, state: "merged"),
            PullRequestFixture.presentation(number: 3, checks: "pending"),
            PullRequestFixture.presentation(number: 4),
            PullRequestFixture.presentation(number: 5),
        ]
        #expect(PullRequestPresentation.listed(pullRequests).map(\.reading.number) == [4, 5, 3, 1])
    }
}

struct PullRequestRowTests {
    @Test func readyRowReadsReferenceDiffstatAndAge() throws {
        let pullRequest = PullRequestFixture.presentation(number: 441, additions: 38, deletions: 612)
        let now = PullRequestFixture.observedAt.addingTimeInterval(86_400)
        let diffstat = try #require(PullRequestDiffstat(additions: 38, deletions: 612))
        #expect(pullRequest.metaPieces(now: now) == [.reference("haus#441"), .diffstat(diffstat), .age("1d")])
    }

    @Test func draftRowReadsWhatHoldsItBackInsteadOfItsSize() {
        let pullRequest = PullRequestFixture.presentation(number: 443, state: "draft", checks: "pending", additions: 4)
        #expect(pullRequest.metaPieces(now: PullRequestFixture.observedAt) == [
            .reference("haus#443"), .status("draft"), .status("checks pending"),
        ])
    }

    @Test func rowWithNoChangedLinesSkipsTheDiffstat() {
        let pullRequest = PullRequestFixture.presentation(number: 7)
        #expect(pullRequest.metaPieces(now: PullRequestFixture.observedAt) == [.reference("haus#7"), .age("now")])
    }

    @Test func untitledReadingFallsBackToItsNumber() {
        #expect(PullRequestFixture.presentation(number: 9, title: nil).title == "Pull request #9")
    }

    @Test func toneFollowsChecksThenState() {
        #expect(PullRequestFixture.presentation(number: 1).tone == .positive)
        #expect(PullRequestFixture.presentation(number: 1, checks: "pending").tone == .caution)
        #expect(PullRequestFixture.presentation(number: 1, checks: "failing").tone == .critical)
        #expect(PullRequestFixture.presentation(number: 1, state: "draft").tone == .mutedInk)
        #expect(PullRequestFixture.presentation(number: 1, state: "merged").tone == .accentInk)
    }

    @Test func unknownReviewHidesItsTag() {
        #expect(PullRequestFixture.presentation(number: 1, review: "unknown").reviewLabel == nil)
        #expect(PullRequestFixture.presentation(number: 1, review: "approved").reviewLabel == "Approved")
    }
}

struct PullRequestDiffstatTests {
    @Test func readsPlusAndTrueMinus() throws {
        let diffstat = try #require(PullRequestDiffstat(additions: 38, deletions: 612))
        #expect(diffstat.text == "+38 \u{2212}612")
    }

    @Test func oneSidedChangesStillReadBothSides() throws {
        #expect(try #require(PullRequestDiffstat(additions: 0, deletions: 5)).text == "+0 \u{2212}5")
    }

    @Test func noChangedLinesIsNoDiffstat() {
        #expect(PullRequestDiffstat(additions: 0, deletions: 0) == nil)
    }

    @Test func filesCountIsSingularForOne() {
        #expect(PullRequestDiffstat.filesText(1) == "1 file")
        #expect(PullRequestDiffstat.filesText(14) == "14 files")
    }
}

enum PullRequestFixture {
    static let observedAt = Date(timeIntervalSince1970: 1_790_000_000)

    static func reading(
        number: Int,
        state: String = "open",
        checks: String = "passing",
        review: String = "approved",
        title: String? = "Require iOS 26",
        additions: Int = 0,
        deletions: Int = 0
    ) -> PullRequestReading {
        PullRequestReading(
            number: number,
            repository: "haus/haus",
            state: state,
            checks: checks,
            review: review,
            title: title,
            url: "https://github.com/haus/haus/pull/\(number)",
            additions: additions,
            deletions: deletions,
            changedFiles: 14,
            observedAt: observedAt,
            source: .github
        )
    }

    static func presentation(
        number: Int,
        state: String = "open",
        checks: String = "passing",
        review: String = "approved",
        title: String? = "Require iOS 26",
        additions: Int = 0,
        deletions: Int = 0,
        context: PullRequestContext = PullRequestContext()
    ) -> PullRequestPresentation {
        PullRequestPresentation(
            reading: reading(
                number: number, state: state, checks: checks, review: review, title: title,
                additions: additions, deletions: deletions
            ),
            context: context
        )
    }
}
