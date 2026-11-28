import Foundation
import HausModels
import SwiftUI
import Testing
@testable import HausUI

struct WorkViewContentTests {
    @Test func allShowsEveryNonEmptySection() {
        let content = WorkViewContent(pullRequests: [PullRequestFixture.presentation(number: 1)], files: [])
        #expect(content.sections(for: .all) == [.pullRequests])
        #expect(content.count(of: .pullRequests) == 1)
    }

    @Test func pullRequestsFilterGroupsAndSkipsEmptyGroups() {
        let content = WorkViewContent(
            pullRequests: [
                PullRequestFixture.presentation(number: 1, state: "draft"),
                PullRequestFixture.presentation(number: 2),
                PullRequestFixture.presentation(number: 3, state: "closed"),
            ],
            files: []
        )
        #expect(content.sections(for: .pullRequests) == [.pullRequestGroup(.ready), .pullRequestGroup(.draft)])
        #expect(content.count(of: .pullRequests) == 2)
        #expect(content.sections(for: .files).isEmpty)
    }

    @Test func filesSectionCarriesNoCount() {
        let content = WorkViewContent(pullRequests: [], files: [])
        #expect(!content.showsCount(.files))
        #expect(content.showsCount(.pullRequests))
    }

    @Test func theFiltersAreAllPullRequestsAndFiles() {
        #expect(WorkFilter.allCases.map(\.title) == ["All", "Pull requests", "Files"])
    }
}

struct PullRequestCatalogTests {
    @Test func aTasksReadingListsWithTheTaskAndItsCaptain() throws {
        let detail = WorkFixture.taskDetail(id: "tsk_1", captainID: "agt_forge", readings: [
            PullRequestFixture.reading(number: 441, title: "Require iOS 26"),
        ])
        let author = PullRequestAuthor(captainName: "Forge", tint: .purple)

        let presentations = PullRequestCatalog.presentations(tasks: [detail], captains: ["agt_forge": author])

        let pullRequest = try #require(presentations.only)
        #expect(pullRequest.title == "Require iOS 26")
        #expect(pullRequest.reading.source == .github)
        #expect(pullRequest.context.author == author)
        #expect(pullRequest.context.task?.id == "tsk_1")
        #expect(pullRequest.context.task?.title == "Raise minimum to iOS 26")
        #expect(pullRequest.context.author?.crewLabel == "Forge’s crew")
    }

    @Test func aPullRequestTwoTasksReadListsOnceUnderTheFirst() throws {
        let reading = PullRequestFixture.reading(number: 443, title: "Shared")
        let first = WorkFixture.taskDetail(id: "tsk_1", readings: [reading])
        let second = WorkFixture.taskDetail(id: "tsk_2", readings: [reading])

        let presentations = PullRequestCatalog.presentations(tasks: [first, second], captains: [:])

        let pullRequest = try #require(presentations.only)
        #expect(pullRequest.context.task?.id == "tsk_1")
        #expect(pullRequest.context.author == nil)
    }
}

enum WorkFixture {
    static let start = Date(timeIntervalSince1970: 1_790_000_000)

    static func taskDetail(id: String, captainID: String? = nil, readings: [PullRequestReading]) -> TaskDetail {
        TaskDetail(
            task: TaskRecord(
                id: id, shortID: "k3mq7xta", title: "Raise minimum to iOS 26", activity: .working,
                captainID: captainID, projectID: "chat_haus", serverID: "srv_1", version: 1,
                createdAt: start, updatedAt: start, createdBy: .user(userID: "user_1")
            ),
            pullRequests: readings
        )
    }
}

extension Array {
    fileprivate var only: Element? { count == 1 ? first : nil }
}
