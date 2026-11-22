import Foundation
import HausModels
import Testing
@testable import HausUI

struct TaskBoardTests {
    private let viewer = "user_me"
    private var scope: TaskBoardScopeContext {
        TaskBoardScopeContext(viewerUserID: viewer, captainIDs: ["agent_mine"])
    }

    // MARK: - Grouping and order

    @Test func sectionsRunFromWaitingOnYouToWhatHasEnded() {
        let tasks = [
            task("t_todo", state: .todo, hoursAgo: 1),
            task("t_done", state: .done, hoursAgo: 1),
            task("t_open", state: .open, hoursAgo: 1),
            task("t_wait", state: .open, hoursAgo: 1),
            task("t_canceled", state: .canceled, hoursAgo: 1),
        ]

        let sections = TaskBoardSections.sections(
            tasks,
            filter: TaskBoardFilter(state: .all, scope: .everyone),
            scope: scope,
            waitingOnYou: ["t_wait", "t_canceled"]
        )

        #expect(sections.map(\.kind) == [.waitingOnYou, .inProgress, .todo, .done, .canceled])
        #expect(sections.map(\.title) == ["Waiting on you", "In progress", "Todo", "Done", "Canceled"])
        #expect(sections.first?.tasks.map(\.id) == ["t_wait"])
    }

    @Test func rowsRunNewestFirstOrMostUrgentFirst() {
        let tasks = [
            task("old_urgent", priority: .urgent, hoursAgo: 5),
            task("new_low", priority: .low, hoursAgo: 1),
            task("mid_none", priority: .none, hoursAgo: 3),
        ]
        let filter = TaskBoardFilter(scope: .everyone)

        let newest = TaskBoardSections.sections(tasks, filter: filter, scope: scope, waitingOnYou: [])
        let byPriority = TaskBoardSections.sections(
            tasks, filter: filter, scope: scope, waitingOnYou: [], ordering: .priority
        )

        #expect(newest.first?.tasks.map(\.id) == ["new_low", "mid_none", "old_urgent"])
        #expect(byPriority.first?.tasks.map(\.id) == ["old_urgent", "new_low", "mid_none"])
    }

    @Test func anEmptyListHasNoSections() {
        #expect(TaskBoardSections.sections([], filter: .landing, scope: scope, waitingOnYou: []).isEmpty)
    }

    // MARK: - Default scope

    @Test func mineMeansStartedByYouOrYourCaptainsOrAssignedToYou() {
        let tasks = [
            task("by_me", createdBy: .user(userID: viewer)),
            task("by_my_captain", createdBy: .agent(agentID: "agent_mine")),
            task("assigned_me", createdBy: .user(userID: "user_other"), assignee: .user(userID: viewer)),
            task("by_someone", createdBy: .user(userID: "user_other")),
            task("by_their_captain", createdBy: .agent(agentID: "agent_theirs")),
        ]

        let shown = TaskBoardSections.sections(tasks, filter: .landing, scope: scope, waitingOnYou: [])
            .flatMap(\.tasks).map(\.id)

        #expect(TaskBoardFilter.landing.state == .open)
        #expect(TaskBoardFilter.landing.scope == .mine)
        #expect(Set(shown) == ["by_me", "by_my_captain", "assigned_me"])
    }

    @Test func everyoneShowsEveryTaskTheServerSent() {
        let tasks = [task("a", createdBy: .user(userID: "user_other")), task("b", createdBy: nil)]
        let shown = TaskBoardSections.sections(
            tasks, filter: TaskBoardFilter(scope: .everyone), scope: scope, waitingOnYou: []
        )
        #expect(shown.flatMap(\.tasks).count == 2)
    }

    // MARK: - Chip filters

    @Test func theStateChipAsksForItsStates() {
        #expect(TaskBoardStateChoice.open.states == [.todo, .open])
        #expect(TaskBoardStateChoice.inProgress.states == [.open])
        #expect(TaskBoardStateChoice.done.states == [.done])
        #expect(TaskBoardStateChoice.all.states == nil)
        #expect(TaskBoardStateChoice.open.title == "Open")
    }

    @Test func assignedToMeAndAnExplicitAssigneeReplaceEachOther() {
        var filter = TaskBoardFilter.landing
        filter.choose(scope: .assignedToMe)
        #expect(filter.serverAssignee(viewerUserID: viewer) == .user(id: viewer))

        filter.choose(assignee: .actor(.agent(agentID: "agent_1")))
        #expect(filter.scope == .everyone)
        #expect(filter.serverAssignee(viewerUserID: viewer) == .agent(id: "agent_1"))

        filter.choose(scope: .assignedToMe)
        #expect(filter.assignee == nil)
        #expect(TaskBoardFilter(assignee: .unassigned).serverAssignee(viewerUserID: viewer) == .unassigned)
        #expect(TaskBoardFilter.landing.serverAssignee(viewerUserID: viewer) == nil)
    }

    @Test func theProjectFilterAsksByTaskKeyAndTheLabelFilterNarrowsHere() {
        let project = TaskProjectOption(id: "project_1", name: "product", keyID: "key_1")
        let filter = TaskBoardFilter(scope: .everyone, project: project, labelID: "label_bug")

        let shown = TaskBoardSections.sections(
            [task("bug", labelIDs: ["label_bug"]), task("chore")],
            filter: filter,
            scope: scope,
            waitingOnYou: []
        )

        #expect(filter.serverKeyID == "key_1")
        #expect(filter.hasExtraFilters)
        #expect(shown.flatMap(\.tasks).map(\.id) == ["bug"])
    }

    @Test func theEmptyStateNamesTheFilter() {
        #expect(TaskBoardEmptyState.title(for: .landing) == "No open tasks")
        #expect(TaskBoardEmptyState.title(for: TaskBoardFilter(state: .done)) == "No matching tasks")
        #expect(TaskBoardEmptyState.message(for: .assignedToMe) == "Tasks assigned to you show up here.")
    }

    // MARK: - Rows

    @Test func priorityGlyphsFollowTheApp() {
        #expect(TaskPriorityGlyph(.none) == .unset)
        #expect(TaskPriorityGlyph(.low) == .bars(filled: 1))
        #expect(TaskPriorityGlyph(.medium) == .bars(filled: 2))
        #expect(TaskPriorityGlyph(.high) == .bars(filled: 3))
        #expect(TaskPriorityGlyph(.urgent) == .urgent)
        #expect(TaskPriority.pickerOrder == [.none, .urgent, .high, .medium, .low])
    }

    @Test func theMetaLineReadsKeyProjectAndAge() {
        let record = task("t1", hoursAgo: 2)
        #expect(TaskBoardRow.metaPieces(record, projectName: "product", now: now) == ["SEC-1", "product", "2h"])
        #expect(TaskBoardRow.metaPieces(record, projectName: nil, now: now) == ["SEC-1", "2h"])
    }

    @Test func aTaskWaitsOnYouWhenAnUnreadMessageNamesYou() {
        let named = preview("task_a", state: .open, content: "Need you here [@Me](user://\(viewer))")
        let other = preview("task_b", state: .open, content: "Ping [@Sam](user://user_sam)")
        let ended = preview("task_c", state: .done, content: "[@Me](user://\(viewer))")

        let ids = TaskWaitingOnYou.taskIDs(in: [named, other, ended], viewerUserID: viewer)

        #expect(ids == ["task_a"])
    }

    @Test func aNewTaskGoesToACaptainHomedInItsProject() {
        let captains = [
            TaskPersonOption(actor: .agent(agentID: "agent_a"), name: "Blippy", avatarURL: nil),
            TaskPersonOption(actor: .agent(agentID: "agent_b"), name: "Tiny", avatarURL: nil),
        ]
        let project = TaskProjectOption(id: "p", name: "product", keyID: "k", homeAgentIDs: ["agent_b"])

        #expect(NewTaskDraft.defaultCaptainID(for: project, captains: captains) == "agent_b")
        #expect(NewTaskDraft.defaultCaptainID(for: nil, captains: captains) == "agent_a")
        #expect(!NewTaskDraft(title: "  ", projectID: "p", captainID: "agent_a").canCreate)
        #expect(NewTaskDraft(title: "Ship it", projectID: "p", captainID: "agent_a").canCreate)
    }

    // MARK: - Fixtures

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func task(
        _ id: String,
        state: TaskState = .todo,
        priority: TaskPriority = .none,
        hoursAgo: Double = 1,
        createdBy: TaskActor? = .user(userID: "user_me"),
        assignee: TaskActor? = nil,
        labelIDs: [String] = []
    ) -> TaskRecord {
        let createdAt = now.addingTimeInterval(-hoursAgo * 3_600)
        return TaskRecord(
            id: id,
            key: "SEC-1",
            title: id,
            state: state,
            serverID: "srv",
            version: 1,
            createdAt: createdAt,
            updatedAt: createdAt,
            createdBy: createdBy,
            assignee: assignee,
            priority: priority,
            labelIDs: labelIDs
        )
    }

    private func preview(_ taskID: String, state: TaskState, content: String) -> ChatUnreadPreview {
        let json = """
        {"chatId":"chat_\(taskID)","earlierUnreadCount":0,"messages":[\(TaskBoardTests.message(content))],
         "task":{"taskId":"\(taskID)","key":"SEC-1","title":"T","state":"\(state.rawValue)","projectId":"p"}}
        """
        return try! HausJSON.decoder().decode(ChatUnreadPreview.self, from: Data(json.utf8))
    }

    private static func message(_ content: String) -> String {
        let encoded = String(data: try! JSONEncoder().encode(content), encoding: .utf8)!
        return """
        {"attachments":[],"author":{"agentId":"agent_a","kind":"agent",
          "profile":{"avatarUrl":null,"deleted":false,"description":null,"displayName":"Blippy"}},
         "chatId":"chat","content":\(encoded),"createdAt":"2026-11-03T00:00:00.000Z","id":"m1",
         "nonce":"n1","runId":null,"sequence":1,"serverId":"srv","claim":null}
        """
    }
}
