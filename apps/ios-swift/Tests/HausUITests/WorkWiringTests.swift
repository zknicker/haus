import Foundation
import HausModels
import Testing
@testable import HausUI

struct WorkPillStateTests {
    @Test func countsOpenPullRequests() {
        let content = WorkViewContent(
            pullRequests: [
                PullRequestFixture.presentation(number: 1),
                PullRequestFixture.presentation(number: 2, state: "draft"),
                PullRequestFixture.presentation(number: 3, state: "merged"),
            ],
            files: []
        )
        let pill = WorkPillState(content: content)
        #expect(pill.count == 2)
        #expect(pill.isVisible)
    }

    @Test func aPlaceWithNoWorkShowsNoPill() {
        let pill = WorkPillState(content: WorkViewContent(pullRequests: [], files: []))
        #expect(pill.count == 0)
        #expect(!pill.isVisible)
    }
}

@MainActor
struct WorkReferenceRouteTests {
    @Test func aTaskReferenceOpensItsTask() throws {
        let reference = RichReferencePresentation(id: "tsk_1", kind: .task, label: "Router seam", avatarURL: nil)
        let url = try #require(reference.activationURL)
        var opened: String?
        InAppReferenceRoutes.openTask = { opened = $0.taskID }
        defer { InAppReferenceRoutes.openTask = nil }

        #expect(InAppReferenceRoutes.handle(url))
        #expect(opened == "tsk_1")
        #expect(reference.mark == .glyph(.tasks))
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
}

struct TaskReferenceTests {
    @Test func aCopiedReferenceIsTheWebAppsMarkdownLink() {
        let task = TaskRecord(
            id: "tsk_1", shortID: "k3mq7xta", title: "Fix [the] bug", projectID: "p", serverID: "s", version: 1,
            createdAt: .now, updatedAt: .now, createdBy: .user(userID: "u")
        )
        #expect(TaskReference.markdown(task) == #"[Fix \[the\] bug](task://tsk_1)"#)
    }
}
