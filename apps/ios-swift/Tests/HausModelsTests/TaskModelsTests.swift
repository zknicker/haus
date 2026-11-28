import Foundation
import XCTest
@testable import HausModels

final class TaskModelsTests: XCTestCase {
    func testDecodesATaskOffTheWire() throws {
        let task = try decodeTask()

        XCTAssertEqual(task.shortID, "k3mq7xta")
        XCTAssertEqual(task.activity, .idle)
        XCTAssertEqual(task.status, .idle)
        XCTAssertEqual(task.chatID, "chat_task_12")
        XCTAssertEqual(task.createdBy, .user(userID: "user_1"))
        XCTAssertEqual(task.projectID, "chat_product")
        XCTAssertNil(task.archivedAt)
        XCTAssertFalse(task.isArchived)
    }

    func testNeedsYouOutranksTheActivity() throws {
        let task = try HausJSON.decoder().decode(TaskRecord.self, from: Data(
            "{\(Self.taskFields.replacing(#""needsYou":false"#, with: #""needsYou":true"#))}".utf8
        ))
        XCTAssertEqual(task.activity, .idle)
        XCTAssertEqual(task.status, .needsYou)
        XCTAssertEqual(task.status.label, "Needs you")
    }

    func testActivityStatusesSayWhatTheWebAppSays() {
        XCTAssertEqual(TaskActivityStatus.allCases.map(\.label), ["Needs you", "Working", "Waiting", "Failed", "Idle"])
    }

    func testDecodesTheDetailsFlatShape() throws {
        let detail = try HausJSON.decoder().decode(
            TaskDetail.self,
            from: Data(
                """
                {\(Self.taskFields),
                 "descriptionContent":"","descriptionTaskLinks":[],"followed":true,"pullRequests":[],"unreadCount":2,
                 "mentions":[{"authorLabel":"Forge","chatId":"chat_1","createdAt":"2026-11-03T00:00:00Z",
                   "excerpt":"Should the limit apply?","messageId":"message_1",
                   "place":{"chatId":"chat_1","chatKind":"channel","chatName":"security"}}],
                 "reminders":[{"anchorChatId":"chat_1","kind":"once","nextFireAt":null,
                   "reminderId":"reminder_1","title":"Re-check the limit"}]}
                """.utf8
            )
        )

        XCTAssertEqual(detail.task.shortID, "k3mq7xta")
        XCTAssertEqual(detail.mentions[0].chatID, "chat_1")
        XCTAssertEqual(detail.mentions[0].place.label, "#security")
        XCTAssertEqual(detail.reminders[0].kind, .once)
        XCTAssertNil(detail.reminders[0].nextFireAt)
        XCTAssertTrue(detail.followed)
        XCTAssertEqual(detail.unreadCount, 2)
    }

    func testAPlaceNamesItsChannelAndSaysDMElsewhere() throws {
        let channel = TaskMessagePlace(chatID: "c", chatKind: .channel, chatName: "security")
        let dm = TaskMessagePlace(chatID: "d", chatKind: .dm, chatName: nil)
        let captain = try HausJSON.decoder().decode(
            TaskMessagePlace.self,
            from: Data(#"{"chatId":"k","chatKind":"captain","chatName":null}"#.utf8)
        )

        XCTAssertEqual(channel.label, "#security")
        XCTAssertEqual(dm.label, "DM")
        XCTAssertEqual(captain.chatKind, .captain)
        XCTAssertEqual(captain.label, "DM")
    }

    func testAMessageDecodesItsTaskLinksAndKeepsThemThroughTheLaunchSnapshotCoding() throws {
        let message = try HausJSON.decoder().decode(ChatMessage.self, from: Data(
            """
            {"attachments":[],"author":{"kind":"human","userId":"u","profile":null},"chatId":"c",
             "content":"See [Rotate tokens](task://task_1)","createdAt":"2026-11-03T00:00:00Z","id":"m",
             "nonce":"n","runId":null,"sequence":1,"serverId":"s","claim":null,
             "taskLinks":[{"shortId":"k3mq7xta","taskId":"task_1","text":"Rotate tokens"}]}
            """.utf8
        ))
        XCTAssertEqual(message.taskLinks, [TaskLink(shortID: "k3mq7xta", taskID: "task_1", text: "Rotate tokens")])

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

    // MARK: - Fixtures

    private static let taskFields = """
    "activity":"idle","agentId":"agt_task_12","archivedAt":null,"captainId":null,"chatId":"chat_task_12",
    "computerId":"cmp_1","createdAt":"2026-11-03T00:00:00.000Z","createdBy":{"kind":"user","userId":"user_1"},
    "description":"","id":"task_12","model":"gpt-5.5","needsYou":false,"origin":null,"projectId":"chat_product",
    "serverId":"server_1","shortId":"k3mq7xta","title":"Rotate tokens","titleCustom":false,
    "updatedAt":"2026-11-03T00:00:00Z","version":3
    """

    private func decodeTask() throws -> TaskRecord {
        try HausJSON.decoder().decode(TaskRecord.self, from: Data("{\(Self.taskFields)}".utf8))
    }
}
