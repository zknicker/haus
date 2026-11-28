import Foundation
import XCTest
@testable import HausTransport

final class ChatTransportModelsTests: XCTestCase {
    func testCaptainSendNamesTheCaptainWithoutAChatID() throws {
        let input = SendCaptainChatInput(
            agentID: "agt_cove",
            content: "Hello",
            nonce: "nonce-1",
            serverID: "srv_1"
        )
        let object = try jsonObject(input)

        XCTAssertEqual(
            Set(object.keys),
            ["agentId", "attachmentIds", "content", "nonce", "serverId", "targetKind"]
        )
        XCTAssertNil(object["chatId"])
        XCTAssertEqual(object["agentId"] as? String, "agt_cove")
        XCTAssertEqual(object["targetKind"] as? String, "captain")
    }

    func testMentionInputsDistinguishDurableChatAndCaptain() throws {
        let chat = try jsonObject(ChatMentionOptionsInput(chatID: "chat_1", serverID: "srv_1"))
        let captain = try jsonObject(CaptainMentionOptionsInput(agentID: "agt_1", serverID: "srv_1"))

        XCTAssertEqual(chat["chatId"] as? String, "chat_1")
        XCTAssertNil(chat["targetKind"])
        XCTAssertEqual(captain["agentId"] as? String, "agt_1")
        XCTAssertEqual(captain["targetKind"] as? String, "captain")
    }

    private func jsonObject<Value: Encodable>(_ value: Value) throws -> [String: Any] {
        let data = try JSONEncoder().encode(value)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }
}
