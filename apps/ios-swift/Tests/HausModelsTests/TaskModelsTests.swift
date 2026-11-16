import Foundation
import XCTest
@testable import HausModels

/// Tasks as the wire returns them, and the inputs that go back.
final class TaskModelsTests: XCTestCase {
    func testDecodesATaskOffTheWire() throws {
        let task = try decodeTask()

        XCTAssertEqual(task.key, "SEC-12")
        XCTAssertEqual(task.assignee, .agent(agentID: "agent_1"))
        XCTAssertEqual(task.createdBy, .user(userID: "user_1"))
        XCTAssertEqual(task.category, .todo)
        XCTAssertEqual(task.priority, .high)
        XCTAssertEqual(task.dueOn, "2026-11-10")
        XCTAssertEqual(task.labelIDs, ["label_1"])
        XCTAssertNil(task.completedAt)
    }

    func testDecodesTheDetailsFlatShape() throws {
        let detail = try HausJSON.decoder().decode(
            BoardTaskDetail.self,
            from: Data(
                """
                {\(Self.taskFields),
                 "mentions":[{"authorLabel":"Forge","chatId":"thread_1","createdAt":"2026-11-03T00:00:00Z",
                   "excerpt":"Should the limit apply?","messageId":"message_1",
                   "place":{"chatId":"chat_1","chatKind":"channel","chatName":"security",
                     "threadAnchorMessageId":"anchor_1"}}],
                 "reminders":[{"anchorChatId":"chat_1","kind":"once","nextFireAt":null,
                   "reminderId":"reminder_1","title":"Re-check SEC-12"}]}
                """.utf8
            )
        )

        XCTAssertEqual(detail.task.key, "SEC-12")
        XCTAssertEqual(detail.mentions[0].chatID, "thread_1")
        XCTAssertEqual(detail.mentions[0].place.chatID, "chat_1")
        XCTAssertEqual(detail.mentions[0].place.threadAnchorMessageID, "anchor_1")
        XCTAssertEqual(detail.mentions[0].place.label, "#security · Thread")
        XCTAssertEqual(detail.reminders[0].kind, .once)
        XCTAssertNil(detail.reminders[0].nextFireAt)
    }

    func testAMessageDecodesItsTaskLinksAndServersThatPredateThemDecodeEmpty() throws {
        let message = """
        "attachments":[],"author":{"kind":"human","userId":"u","profile":null},"chatId":"c",
        "content":"See SEC-12","createdAt":"2026-11-03T00:00:00Z","id":"m","nonce":"n","runId":null,
        "sequence":1,"serverId":"s","claim":null
        """
        let linked = try HausJSON.decoder().decode(ChatMessage.self, from: Data(
            #"{\#(message),"taskLinks":[{"key":"SEC-12","taskId":"task_1","text":"SEC-12"}]}"#.utf8
        ))
        XCTAssertEqual(linked.taskLinks, [TaskLink(key: "SEC-12", taskID: "task_1", text: "SEC-12")])

        let older = try HausJSON.decoder().decode(ChatMessage.self, from: Data("{\(message)}".utf8))
        XCTAssertEqual(older.taskLinks, [])
    }

    func testAMessageKeepsItsTaskLinksThroughTheLaunchSnapshotCoding() throws {
        let message = try HausJSON.decoder().decode(ChatMessage.self, from: Data(
            """
            {"attachments":[],"author":{"kind":"human","userId":"u","profile":null},"chatId":"c",
             "content":"See SEC-12","createdAt":"2026-11-03T00:00:00Z","id":"m","nonce":"n","runId":null,
             "sequence":1,"serverId":"s","claim":null,
             "taskLinks":[{"key":"SEC-12","taskId":"task_1","text":"SEC-12"}]}
            """.utf8
        ))
        let copy = try HausJSON.decoder().decode(ChatMessage.self, from: HausJSON.encoder().encode(message))
        XCTAssertEqual(copy.taskLinks, message.taskLinks)
    }

    // MARK: - Inputs

    func testCreateOmitsWhatTheServerDefaults() throws {
        let object = try json(TaskCreateInput(serverID: "s", boardID: "b", title: "Rotate tokens"))
        XCTAssertEqual(object as? [String: String], ["serverId": "s", "boardId": "b", "title": "Rotate tokens"])
    }

    /// Convert to Task leaves the description off, so the Server fills it from
    /// the message rather than taking an explicit blank.
    func testConvertSendsItsSourceMessageAndNoDescription() throws {
        let object = try json(TaskCreateInput(
            serverID: "s",
            boardID: "b",
            title: "Rotate tokens",
            sourceMessageID: "message_1"
        ))
        XCTAssertEqual(object["sourceMessageId"] as? String, "message_1")
        XCTAssertNil(object["description"])
    }

    func testCreateCarriesAnActorInItsTaggedForm() throws {
        let object = try json(TaskCreateInput(
            serverID: "s",
            boardID: "b",
            title: "Rotate tokens",
            columnID: "col",
            assignee: .user(userID: "u"),
            priority: .urgent,
            dueOn: "2026-11-10"
        ))
        XCTAssertEqual(object["assignee"] as? [String: String], ["kind": "user", "userId": "u"])
        XCTAssertEqual(object["columnId"] as? String, "col")
        XCTAssertEqual(object["priority"] as? String, "urgent")
        XCTAssertEqual(object["dueOn"] as? String, "2026-11-10")
    }

    /// The wire tells leaving a due date alone from clearing it.
    func testUpdateTellsAnUntouchedDueDateFromACleared() throws {
        let untouched = try json(TaskUpdateInput(
            serverID: "s", taskID: "t", expectedVersion: 2, patch: TaskUpdatePatch(title: "New")
        ))
        let patch = try XCTUnwrap(untouched["patch"] as? [String: Any])
        XCTAssertEqual(patch as? [String: String], ["title": "New"])
        XCTAssertEqual(untouched["expectedVersion"] as? Int, 2)

        let cleared = try json(TaskUpdatePatch(dueOn: .cleared))
        XCTAssertTrue(cleared["dueOn"] is NSNull)

        let set = try json(TaskUpdatePatch(dueOn: .set("2026-11-10")))
        XCTAssertEqual(set["dueOn"] as? String, "2026-11-10")
    }

    func testUnassigningSendsAnExplicitNull() throws {
        let object = try json(TaskAssignInput(serverID: "s", taskID: "t", expectedVersion: 1, assignee: nil))
        XCTAssertTrue(object["assignee"] is NSNull)

        let assigned = try json(TaskAssignInput(
            serverID: "s", taskID: "t", expectedVersion: 1, assignee: .agent(agentID: "a")
        ))
        XCTAssertEqual(assigned["assignee"] as? [String: String], ["agentId": "a", "kind": "agent"])
    }

    func testMoveUsesTheServerWireNames() throws {
        let object = try json(TaskMoveInput(serverID: "s", taskID: "t", expectedVersion: 7, columnID: "c"))
        XCTAssertEqual(object["taskId"] as? String, "t")
        XCTAssertEqual(object["columnId"] as? String, "c")
        XCTAssertEqual(object["expectedVersion"] as? Int, 7)
    }

    // MARK: - Optimistic move

    func testAMoveReadsAsTheNewColumnAndKeepsTheServersVersion() throws {
        let task = try decodeTask()
        let moved = task.moved(to: BoardColumn(category: .done, id: "col_done", name: "Done", position: 3))

        XCTAssertEqual(moved.columnID, "col_done")
        XCTAssertEqual(moved.category, .done)
        XCTAssertNotNil(moved.completedAt)
        XCTAssertEqual(moved.version, task.version)
    }

    // MARK: - Due date

    func testADueDateIsACalendarDayInTheReadersZone() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "America/Los_Angeles"))
        let date = try XCTUnwrap(TaskDueDate.date("2026-11-10", calendar: calendar))

        XCTAssertEqual(TaskDueDate.dueOn(from: date, calendar: calendar), "2026-11-10")
        XCTAssertNil(TaskDueDate.date("2026-02-31", calendar: calendar))
        XCTAssertNil(TaskDueDate.date("soon", calendar: calendar))
    }

    func testATaskDueTodayIsNotOverdueUntilTomorrow() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "America/Los_Angeles"))
        let lateOnTheDay = try XCTUnwrap(
            calendar.date(from: DateComponents(year: 2026, month: 11, day: 10, hour: 23))
        )
        let nextMorning = lateOnTheDay.addingTimeInterval(3_600 * 2)

        XCTAssertFalse(TaskDueDate.isOverdue("2026-11-10", now: lateOnTheDay, calendar: calendar))
        XCTAssertTrue(TaskDueDate.isOverdue("2026-11-10", now: nextMorning, calendar: calendar))
    }

    // MARK: - Groups

    func testOpenColumnsSortByPriorityThenDueThenAge() throws {
        let sorted = BoardTaskGroups.sorted([
            try decodeTask(number: 3, priority: "none"),
            try decodeTask(number: 2, priority: "high", dueOn: nil),
            try decodeTask(number: 4, priority: "high", dueOn: "2026-11-09"),
            try decodeTask(number: 1, priority: "urgent", dueOn: nil),
        ], in: .todo)

        XCTAssertEqual(sorted.map(\.number), [1, 4, 2, 3])
    }

    func testEveryColumnKeepsItsPlaceWhenEmpty() throws {
        let columns = [
            BoardColumn(category: .todo, id: "col_todo", name: "Todo", position: 0),
            BoardColumn(category: .done, id: "col_done", name: "Done", position: 1),
        ]
        let groups = BoardTaskGroups.groups(columns: columns, tasks: [try decodeTask()])

        XCTAssertEqual(groups.map(\.column.id), ["col_todo", "col_done"])
        XCTAssertEqual(groups.map(\.tasks.count), [1, 0])
    }

    func testFlagsOnlyAgentsHoldingMoreThanOneActiveTask() throws {
        let tasks = [
            try decodeTask(number: 1, category: "active", assignee: Self.agent("forge")),
            try decodeTask(number: 2, category: "active", assignee: Self.agent("forge")),
            try decodeTask(number: 3, category: "active", assignee: Self.agent("tiny")),
            try decodeTask(number: 4, category: "todo", assignee: Self.agent("tiny")),
            try decodeTask(number: 5, category: "active", assignee: #"{"kind":"user","userId":"u"}"#),
            try decodeTask(number: 6, category: "active", assignee: #"{"kind":"user","userId":"u"}"#),
        ]
        let overloaded = BoardTaskGroups.overloadedAgents(tasks)

        XCTAssertEqual(overloaded.map(\.agentID), ["forge"])
        XCTAssertEqual(overloaded.map(\.count), [2])
    }

    func testFiltersByAssigneeAndLabel() throws {
        let task = try decodeTask()

        XCTAssertTrue(BoardTaskFilter().matches(task))
        XCTAssertTrue(BoardTaskFilter(assignee: .actor(.agent(agentID: "agent_1"))).matches(task))
        XCTAssertFalse(BoardTaskFilter(assignee: .unassigned).matches(task))
        XCTAssertTrue(BoardTaskFilter(labelID: "label_1").matches(task))
        XCTAssertFalse(BoardTaskFilter(labelID: "label_2").matches(task))
    }

    // MARK: - Fixtures

    private static func agent(_ id: String) -> String {
        #"{"agentId":"\#(id)","kind":"agent"}"#
    }

    private static let taskFields = fields(
        number: 12, category: "todo", priority: "high", dueOn: "2026-11-10", assignee: agent("agent_1")
    )

    private static func fields(
        number: Int,
        category: String,
        priority: String,
        dueOn: String?,
        assignee: String
    ) -> String {
        """
        "assignee":\(assignee),"boardId":"board_1","category":"\(category)","columnId":"col_\(category)",
        "completedAt":null,"createdAt":"2026-11-03T00:00:00.000Z",
        "createdBy":{"kind":"user","userId":"user_1"},"description":"","dueOn":\(dueOn.map { "\"\($0)\"" } ?? "null"),
        "id":"task_\(number)","key":"SEC-\(number)","labelIds":["label_1"],"number":\(number),
        "priority":"\(priority)","serverId":"server_1","title":"Rotate tokens",
        "updatedAt":"2026-11-03T00:00:00Z","version":3
        """
    }

    private func decodeTask(
        number: Int = 12,
        category: String = "todo",
        priority: String = "high",
        dueOn: String? = "2026-11-10",
        assignee: String = TaskModelsTests.agent("agent_1")
    ) throws -> BoardTask {
        let body = Self.fields(
            number: number, category: category, priority: priority, dueOn: dueOn, assignee: assignee
        )
        return try HausJSON.decoder().decode(BoardTask.self, from: Data("{\(body)}".utf8))
    }

    private func json(_ value: some Encodable) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as? [String: Any])
    }
}
