import Foundation
import XCTest
@testable import HausModels

final class PushTaskAssignmentTests: XCTestCase {
    private let aps: [String: Any] = [
        "alert": ["body": "Rate-limit webhooks", "title": "Forge assigned you SEC-12"],
        "sound": "default",
        "thread-id": "task_12",
    ]

    func testATaskAssignmentPushDecodes() {
        let userInfo: [AnyHashable: Any] = [
            "aps": aps, "key": "SEC-12", "kind": "task_assignment", "serverId": "server_1", "taskId": "task_12",
        ]
        let push = PushTaskAssignment(userInfo: userInfo)
        XCTAssertEqual(push?.key, "SEC-12")
        XCTAssertEqual(push?.taskID, "task_12")
        XCTAssertEqual(HausPush(userInfo: userInfo)?.serverID, "server_1")
        XCTAssertNil(PushNotificationPayload(userInfo: userInfo))
    }

    func testABurstPushDecodesItsCount() {
        let userInfo: [AnyHashable: Any] = ["aps": aps, "count": 3, "kind": "task_assignment_burst", "serverId": "server_1"]
        guard case let .taskAssignmentBurst(burst) = HausPush(userInfo: userInfo) else { return XCTFail("Expected a burst") }
        XCTAssertEqual(burst.count, 3)
    }

    func testMalformedAssignmentPushesDecodeToNothing() {
        XCTAssertNil(HausPush(userInfo: ["kind": "task_assignment", "key": "sec-12", "serverId": "s", "taskId": "t"]))
        XCTAssertNil(HausPush(userInfo: ["kind": "task_assignment", "key": "SEC-12", "serverId": "s"]))
        XCTAssertNil(HausPush(userInfo: ["kind": "task_assignment_burst", "count": 1, "serverId": "s"]))
        XCTAssertNil(HausPush(userInfo: ["kind": "task_assignment_burst", "count": true, "serverId": "s"]))
        XCTAssertNil(HausPush(userInfo: ["kind": "task_assignment_burst", "count": 2.5, "serverId": "s"]))
        XCTAssertNil(HausPush(userInfo: ["kind": "something_new", "serverId": "s"]))
    }

    func testAMessagePushStillDecodesAsAMessage() {
        let userInfo: [AnyHashable: Any] = [
            "chatId": "chat_1", "conversationChatId": "chat_1", "messageId": "msg_1", "serverId": "server_1",
        ]
        guard case let .message(message) = HausPush(userInfo: userInfo) else { return XCTFail("Expected a message") }
        XCTAssertEqual(message.messageID, "msg_1")
    }
}
