import Foundation
import XCTest
@testable import HausModels

final class PushIssueTests: XCTestCase {
    private let aps: [String: Any] = [
        "alert": ["body": "Rate-limit webhooks", "title": "Forge assigned you GEN-12"],
        "sound": "default",
        "thread-id": "iss_12",
    ]

    func testAnIssueAssignmentPushDecodes() {
        let userInfo: [AnyHashable: Any] = [
            "aps": aps, "code": "GEN-12", "issueId": "iss_12", "kind": "issue_assignment", "serverId": "server_1",
        ]
        guard case let .issue(push) = HausPush(userInfo: userInfo) else { return XCTFail("Expected an Issue push") }
        XCTAssertEqual(push.code, "GEN-12")
        XCTAssertEqual(push.issueID, "iss_12")
        XCTAssertEqual(push.kind, .assignment)
        XCTAssertEqual(HausPush(userInfo: userInfo)?.serverID, "server_1")
        XCTAssertNil(PushNotificationPayload(userInfo: userInfo))
    }

    func testAnIssueCommentPushDecodes() {
        let userInfo: [AnyHashable: Any] = [
            "aps": aps, "code": "GEN-12", "issueId": "iss_12", "kind": "issue_comment", "serverId": "server_1",
        ]
        guard case let .issue(push) = HausPush(userInfo: userInfo) else { return XCTFail("Expected an Issue push") }
        XCTAssertEqual(push.kind, .comment)
    }

    func testMalformedAndRetiredPushesDecodeToNothing() {
        XCTAssertNil(HausPush(userInfo: ["kind": "issue_assignment", "code": "GEN-12", "serverId": "s"]))
        XCTAssertNil(HausPush(userInfo: ["kind": "issue_comment", "issueId": "i", "code": " ", "serverId": "s"]))
        XCTAssertNil(HausPush(userInfo: ["kind": "task_assignment", "key": "SEC-12", "serverId": "s", "taskId": "t"]))
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
