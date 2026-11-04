import Foundation
import XCTest
@testable import HausModels

/// The Task Inbox as the wire returns it, and the assignment push.
final class TaskInboxModelsTests: XCTestCase {
    func testDecodesAnItemWithItsContextMessage() throws {
        let list = try HausJSON.decoder().decode(
            TaskInboxList.self,
            from: Data(
                """
                {"items":[{"assignedAt":"2026-11-03T00:00:00.000Z",
                  "assignedBy":{"id":"agent_1","kind":"agent","label":"Zero"},
                  "boardName":"Security",
                  "contextMessage":{"attachments":[],"author":{"kind":"human","userId":"u","profile":null},
                    "chatId":"chat_1","content":"On SEC-27: scope me down","createdAt":"2026-11-03T00:00:00Z",
                    "id":"message_1","nonce":"n","runId":null,"sequence":1,"serverId":"server_1","claim":null,
                    "taskLinks":[{"key":"SEC-27","taskId":"task_27","text":"SEC-27"}]},
                  "task":{"assignee":{"kind":"user","userId":"u"},"boardId":"board_1","category":"todo",
                    "columnId":"col_1","completedAt":null,"createdAt":"2026-11-03T00:00:00Z",
                    "createdBy":{"agentId":"agent_1","kind":"agent"},"description":"","dueOn":null,
                    "id":"task_27","key":"SEC-27","labelIds":[],"number":27,"priority":"high",
                    "serverId":"server_1","title":"Review the vault","updatedAt":"2026-11-03T00:00:00Z",
                    "version":1}}]}
                """.utf8
            )
        )

        let item = try XCTUnwrap(list.items.first)
        XCTAssertEqual(item.id, "task_27")
        XCTAssertEqual(item.assignedBy.kind, .agent)
        XCTAssertEqual(item.assignedBy.label, "Zero")
        XCTAssertEqual(item.boardName, "Security")
        XCTAssertEqual(item.contextMessage?.taskLinks.first?.taskID, "task_27")
    }

    func testAnItemCanHaveNoContextMessage() throws {
        let item = try HausJSON.decoder().decode(
            TaskInboxItem.self,
            from: Data(
                """
                {"assignedAt":"2026-11-03T00:00:00Z",
                 "assignedBy":{"id":"u","kind":"user","label":"Ada"},"boardName":"General",
                 "contextMessage":null,
                 "task":{"assignee":null,"boardId":"b","category":"todo","columnId":"c","completedAt":null,
                   "createdAt":"2026-11-03T00:00:00Z","createdBy":{"kind":"user","userId":"u"},
                   "description":"","dueOn":null,"id":"t","key":"GEN-1","labelIds":[],"number":1,
                   "priority":"none","serverId":"s","title":"Tidy","updatedAt":"2026-11-03T00:00:00Z",
                   "version":1}}
                """.utf8
            )
        )

        XCTAssertNil(item.contextMessage)
    }

    func testClearAndRestoreShareOneInput() throws {
        let object = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(TaskInboxItemInput(serverID: "s", taskID: "t"))
        ) as? [String: String]
        XCTAssertEqual(object, ["serverId": "s", "taskId": "t"])
    }

    func testEachResolutionLandsInItsCategory() {
        XCTAssertEqual(TaskInboxResolution.start.category, .active)
        XCTAssertEqual(TaskInboxResolution.done.category, .done)
        XCTAssertEqual(TaskInboxResolution.wontDo.category, .canceled)
        XCTAssertEqual(TaskInboxResolution.allCases.map(\.title), ["Start", "Done", "Won't do"])
    }

    // MARK: - Push

    private let assignment: [AnyHashable: Any] = [
        "aps": ["alert": ["title": "Ada assigned you SEC-12", "body": "Rate-limit"], "thread-id": "task_1"],
        "key": "SEC-12",
        "kind": "task_assignment",
        "serverId": "server_1",
        "taskId": "task_1",
    ]

    func testAnAssignmentPushOpensItsTask() {
        XCTAssertEqual(
            PushOpenRequest(userInfo: assignment),
            .task(PushTaskAssignmentPayload(serverID: "server_1", taskID: "task_1", key: "SEC-12"))
        )
    }

    func testAMessagePushStaysAMessage() {
        let request = PushOpenRequest(userInfo: [
            "serverId": "server_1",
            "chatId": "chat_1",
            "conversationChatId": "chat_1",
            "messageId": "message_1",
        ])
        guard case .message(let payload) = request else {
            return XCTFail("Expected a message push")
        }
        XCTAssertEqual(payload.route, .chat(chatID: "chat_1"))
    }

    func testAMalformedAssignmentOpensNothing() {
        var missing = assignment
        missing["taskId"] = nil
        XCTAssertNil(PushOpenRequest(userInfo: missing))

        var otherKind = assignment
        otherKind["kind"] = "something_else"
        XCTAssertNil(PushOpenRequest(userInfo: otherKind))
    }

    /// It has no sender or conversation: the extension delivers it as sent.
    func testTheNotificationServiceLeavesAnAssignmentAlone() {
        XCTAssertNil(PushNotificationCommunication(userInfo: assignment))
    }

    /// An assignment groups under its Task id, so opening the Task answers it
    /// through the same rule a conversation uses.
    func testOpeningTheTaskClearsItsDeliveredAssignment() {
        let delivered = [
            DeliveredPushCleanup.Delivered(identifier: "1", threadID: "task_1", payload: nil),
            DeliveredPushCleanup.Delivered(identifier: "2", threadID: "task_2", payload: nil),
        ]
        XCTAssertEqual(DeliveredPushCleanup.identifiers(delivered, openedChatID: "task_1"), ["1"])
    }
}
