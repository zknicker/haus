import Foundation
import XCTest
@testable import HausModels

/// Tasks as the wire returns them.
final class TaskModelsTests: XCTestCase {
    func testDecodesATaskOffTheWire() throws {
        let task = try decodeTask()

        XCTAssertEqual(task.key, "SEC-12")
        XCTAssertEqual(task.state, .todo)
        XCTAssertEqual(task.chatID, "chat_task_12")
        XCTAssertEqual(task.assignee, .agent(agentID: "agent_1"))
        XCTAssertEqual(task.createdBy, .user(userID: "user_1"))
        XCTAssertEqual(task.priority, .high)
        XCTAssertEqual(task.dueOn, "2026-11-10")
        XCTAssertEqual(task.labelIDs, ["label_1"])
        XCTAssertNil(task.completedAt)
    }

    /// The fields a Task screen does not stand on decode leniently: a Server
    /// that drops or adds one never costs the Task its screen.
    func testATaskWithoutItsOptionalFieldsOrWithNewOnesStillDecodes() throws {
        let task = try HausJSON.decoder().decode(TaskRecord.self, from: Data(
            """
            {"id":"task_1","key":"SEC-1","title":"Old","state":"done","chatId":null,"serverId":"s",
             "version":1,"createdAt":"2026-10-30T16:00:00Z","updatedAt":"2026-10-30T16:00:00Z",
             "createdBy":{"kind":"robot"},"priority":"someday","boardId":"board_1","category":"done",
             "columnId":"col_1","futureField":{"a":1}}
            """.utf8
        ))
        XCTAssertNil(task.chatID)
        XCTAssertNil(task.origin)
        XCTAssertNil(task.createdBy)
        XCTAssertEqual(task.priority, .none)
        XCTAssertEqual(task.labelIDs, [])
        XCTAssertEqual(task.description, "")
    }

    func testDecodesTheDetailsFlatShape() throws {
        let detail = try HausJSON.decoder().decode(
            TaskDetail.self,
            from: Data(
                """
                {\(Self.taskFields),
                 "mentions":[{"authorLabel":"Forge","chatId":"chat_1","createdAt":"2026-11-03T00:00:00Z",
                   "excerpt":"Should the limit apply?","messageId":"message_1",
                   "place":{"chatId":"chat_1","chatKind":"channel","chatName":"security"}}],
                 "reminders":[{"anchorChatId":"chat_1","kind":"once","nextFireAt":null,
                   "reminderId":"reminder_1","title":"Re-check SEC-12"}]}
                """.utf8
            )
        )

        XCTAssertEqual(detail.task.key, "SEC-12")
        XCTAssertEqual(detail.mentions[0].chatID, "chat_1")
        XCTAssertEqual(detail.mentions[0].place.chatID, "chat_1")
        XCTAssertEqual(detail.mentions[0].place.label, "#security")
        XCTAssertEqual(detail.reminders[0].kind, .once)
        XCTAssertNil(detail.reminders[0].nextFireAt)
        // A Server that predates the resolved description reads as the description.
        XCTAssertEqual(detail.descriptionContent, detail.task.description)
        XCTAssertEqual(detail.descriptionTaskLinks, [])
    }

    func testDecodesTheResolvedDescription() throws {
        let detail = try HausJSON.decoder().decode(
            TaskDetail.self,
            from: Data(
                """
                {\(Self.taskFields),
                 "descriptionContent":"In [#ops](chat://chat_1), see SEC-12",
                 "descriptionTaskLinks":[{"key":"SEC-12","taskId":"task_12","text":"SEC-12"}],
                 "mentions":[],"reminders":[]}
                """.utf8
            )
        )
        XCTAssertEqual(detail.descriptionContent, "In [#ops](chat://chat_1), see SEC-12")
        XCTAssertEqual(detail.descriptionTaskLinks, [TaskLink(key: "SEC-12", taskID: "task_12", text: "SEC-12")])
    }

    func testAPlaceNamesItsChannelAndSaysDMForADM() {
        let channel = TaskMessagePlace(chatID: "c", chatKind: .channel, chatName: "security")
        let dm = TaskMessagePlace(chatID: "d", chatKind: .dm, chatName: nil)

        XCTAssertEqual(channel.label, "#security")
        XCTAssertEqual(dm.label, "DM")
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

    func testTheReadUsesTheServerWireNames() throws {
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(TaskGetInput(serverID: "s", taskID: "t")))
                as? [String: String]
        )
        XCTAssertEqual(object, ["serverId": "s", "taskId": "t"])
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

    // MARK: - Fixtures

    private static let taskFields = """
    "assignee":{"agentId":"agent_1","kind":"agent"},"chatId":"chat_task_12",
    "completedAt":null,"createdAt":"2026-11-03T00:00:00.000Z",
    "createdBy":{"kind":"user","userId":"user_1"},"description":"","dueOn":"2026-11-10",
    "id":"task_12","key":"SEC-12","labelIds":["label_1"],"number":12,"origin":null,
    "priority":"high","serverId":"server_1","state":"todo","title":"Rotate tokens",
    "updatedAt":"2026-11-03T00:00:00Z","version":3
    """

    private func decodeTask() throws -> TaskRecord {
        try HausJSON.decoder().decode(TaskRecord.self, from: Data("{\(Self.taskFields)}".utf8))
    }
}
