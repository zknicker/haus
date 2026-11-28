import Foundation
import HausModels
import Testing
@testable import HausUI

struct TaskListTests {
    private let viewer = "user_me"
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    @Test func activeListsGroupByActivityWithTheTasksThatNeedYouFirst() {
        let tasks = [
            task("idle", activity: .idle),
            task("working", activity: .working),
            task("needs", activity: .waiting, needsYou: true),
            task("failed", activity: .failed),
            task("waiting", activity: .waiting),
        ]

        let sections = TaskListSections.sections(tasks, view: .all, viewerUserID: viewer)

        #expect(sections.map(\.title) == ["Needs you", "Working", "Waiting", "Failed", "Idle"])
        #expect(sections.map { $0.tasks.map(\.id) } == [["needs"], ["working"], ["waiting"], ["failed"], ["idle"]])
    }

    @Test func rowsRunNewestFirstLikeTheWebTasksPage() {
        let tasks = [task("old", hoursAgo: 5), task("new", hoursAgo: 1), task("mid", hoursAgo: 3)]

        let sections = TaskListSections.sections(tasks, view: .all, viewerUserID: viewer)

        #expect(sections.first?.tasks.map(\.id) == ["new", "mid", "old"])
    }

    @Test func myTasksAreTheOnesTheReaderStarted() {
        let tasks = [
            task("mine"),
            task("theirs", createdBy: .user(userID: "user_other")),
            task("crew", createdBy: .agent(agentID: "agent_1")),
        ]

        #expect(TaskListSections.sections(tasks, view: .mine, viewerUserID: viewer).flatMap(\.tasks).map(\.id) == ["mine"])
        #expect(TaskListSections.sections(tasks, view: .all, viewerUserID: viewer).flatMap(\.tasks).count == 3)
        #expect(TaskListSections.sections(tasks, view: .mine, viewerUserID: nil).isEmpty)
    }

    @Test func archivedTasksListFlatByWhenEachWasArchived() {
        let tasks = [
            task("first", archivedHoursAgo: 10, activity: .failed),
            task("last", archivedHoursAgo: 1, activity: .working),
        ]

        let sections = TaskListSections.sections(tasks, view: .archived, viewerUserID: viewer)

        #expect(sections.map(\.title) == ["Archived"])
        #expect(sections.first?.tasks.map(\.id) == ["last", "first"])
    }

    @Test func anEmptyListHasNoSectionsAndSaysWhereTasksComeFrom() {
        #expect(TaskListSections.sections([], view: .mine, viewerUserID: viewer).isEmpty)
        #expect(TaskListSections.emptyTitle(.mine) == "No tasks yet")
        #expect(TaskListSections.emptyMessage(.all) == "Start one from Home, or ask a Captain to.")
        #expect(TaskListSections.emptyTitle(.archived) == "No archived tasks")
        #expect(TaskListSections.emptyMessage(.archived) == nil)
    }

    @Test func theViewsAreTheWebTasksPageTabs() {
        #expect(TaskListView.allCases.map(\.title) == ["My tasks", "All tasks", "Archived"])
        #expect(TaskListView.archived.isArchived)
        #expect(!TaskListView.mine.isArchived)
    }

    @Test func theMetaLineReadsProjectMachineModelAndAge() {
        let content = TaskListContent(
            tasks: [],
            viewerUserID: viewer,
            projectNames: ["chat_product": "#product"],
            machineNames: ["cmp_1": "Studio"],
            modelLabels: ["gpt-5": "GPT-5"]
        )

        #expect(content.metaPieces(task("t", hoursAgo: 2), now: now) == ["#product", "Studio", "GPT-5", "2h"])
    }

    @Test func aDiscSaysArchivedOrTheActivity() {
        #expect(TaskDiscState(task("a", archivedHoursAgo: 1)).label == "Archived")
        #expect(TaskDiscState(task("w", activity: .working)).label == "Working")
        #expect(TaskDiscState(task("n", activity: .idle, needsYou: true)).label == "Needs you")
        #expect(TaskDiscState(isArchived: false, status: nil).label == "Active")
    }

    private func task(
        _ id: String,
        hoursAgo: Double = 1,
        archivedHoursAgo: Double? = nil,
        activity: TaskActivity = .idle,
        needsYou: Bool = false,
        createdBy: TaskActor = .user(userID: "user_me")
    ) -> TaskRecord {
        let createdAt = now.addingTimeInterval(-hoursAgo * 3_600)
        return TaskRecord(
            id: id,
            shortID: "k3mq7xta",
            title: id,
            activity: activity,
            needsYou: needsYou,
            archivedAt: archivedHoursAgo.map { now.addingTimeInterval(-$0 * 3_600) },
            computerID: "cmp_1",
            model: "gpt-5",
            projectID: "chat_product",
            serverID: "srv",
            version: 1,
            createdAt: createdAt,
            updatedAt: createdAt,
            createdBy: createdBy
        )
    }
}
