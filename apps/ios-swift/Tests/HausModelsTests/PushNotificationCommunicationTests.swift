import Foundation
import XCTest
@testable import HausModels

final class PushNotificationCommunicationTests: XCTestCase {
    func testAgentDMParsesSenderAndConversation() throws {
        let communication = try XCTUnwrap(PushNotificationCommunication(userInfo: userInfo()))
        XCTAssertEqual(communication.conversationIdentifier, "chat_dm")
        XCTAssertEqual(communication.conversation, .dm)
        XCTAssertNil(communication.conversation.groupName)
        XCTAssertEqual(
            communication.sender,
            .init(id: "agent_1", kind: .agent, name: "Blippy", avatarURL: URL(string: "https://haus.chat/api/avatars/a1"))
        )
    }

    func testChannelNamesTheGroupWithAHash() throws {
        let info = userInfo(conversation: ["kind": "channel", "name": "product"])
        let communication = try XCTUnwrap(PushNotificationCommunication(userInfo: info))
        XCTAssertEqual(communication.conversation, .channel(name: "product"))
        XCTAssertEqual(communication.conversation.groupName, "#product")
    }

    func testChannelWithoutNameHasNoGroupName() throws {
        let info = userInfo(conversation: ["kind": "channel", "name": NSNull()])
        let communication = try XCTUnwrap(PushNotificationCommunication(userInfo: info))
        XCTAssertEqual(communication.conversation, .channel(name: nil))
        XCTAssertNil(communication.conversation.groupName)
    }

    func testHumanWithNullAvatarHasNoURL() throws {
        let info = userInfo(sender: ["id": "user_1", "kind": "human", "name": "Ada Lovelace", "avatarUrl": NSNull()])
        let communication = try XCTUnwrap(PushNotificationCommunication(userInfo: info))
        XCTAssertEqual(communication.sender.kind, .human)
        XCTAssertNil(communication.sender.avatarURL)
        XCTAssertEqual(communication.sender.initials, "AL")
    }

    func testOlderPushWithoutSenderIsNil() {
        var info = userInfo()
        info.removeValue(forKey: "sender")
        XCTAssertNil(PushNotificationCommunication(userInfo: info))
    }

    func testUnknownKindsAreNil() {
        XCTAssertNil(PushNotificationCommunication(userInfo: userInfo(conversation: ["kind": "thread"])))
        XCTAssertNil(PushNotificationCommunication(
            userInfo: userInfo(sender: ["id": "x", "kind": "bot", "name": "X"])
        ))
    }

    func testAvatarURLPolicy() {
        XCTAssertNotNil(PushNotificationCommunication.fetchableAvatarURL("https://haus.chat/api/avatars/a"))
        XCTAssertNotNil(PushNotificationCommunication.fetchableAvatarURL("http://localhost:43447/api/avatars/a"))
        XCTAssertNotNil(PushNotificationCommunication.fetchableAvatarURL("http://127.0.0.1:43447/api/avatars/a"))
        XCTAssertNotNil(PushNotificationCommunication.fetchableAvatarURL("http://haus.localhost/api/avatars/a"))
        XCTAssertNil(PushNotificationCommunication.fetchableAvatarURL("http://haus.chat/api/avatars/a"))
        XCTAssertNil(PushNotificationCommunication.fetchableAvatarURL("/api/avatars/a"))
        XCTAssertNil(PushNotificationCommunication.fetchableAvatarURL("file:///etc/hosts"))
    }

    func testReasonMapsToFocusSignals() throws {
        let mention = try XCTUnwrap(PushNotificationCommunication(userInfo: userInfo(reason: "mention")))
        XCTAssertEqual(mention.reason, .mention)
        XCTAssertEqual(mention.focusSignals, .init(mentionsCurrentUser: true, isReplyToCurrentUser: false))

        let reply = try XCTUnwrap(PushNotificationCommunication(userInfo: userInfo(reason: "reply")))
        XCTAssertEqual(reply.reason, .reply)
        XCTAssertEqual(reply.focusSignals, .init(mentionsCurrentUser: false, isReplyToCurrentUser: true))

        let dm = try XCTUnwrap(PushNotificationCommunication(userInfo: userInfo(reason: "dm")))
        XCTAssertEqual(dm.reason, .dm)
        XCTAssertNil(dm.focusSignals)
    }

    func testMissingOrUnknownReasonStillParsesWithoutFocusSignals() throws {
        let older = try XCTUnwrap(PushNotificationCommunication(userInfo: userInfo()))
        XCTAssertNil(older.reason)
        XCTAssertNil(older.focusSignals)

        let unknown = try XCTUnwrap(PushNotificationCommunication(userInfo: userInfo(reason: "task")))
        XCTAssertNil(unknown.reason)
        XCTAssertNil(unknown.focusSignals)
    }

    func testInitialsMatchWeb() {
        XCTAssertEqual(PushNotificationCommunication.initials(for: "Blippy"), "BL")
        XCTAssertEqual(PushNotificationCommunication.initials(for: "Grace Brewster Hopper"), "GH")
        XCTAssertEqual(PushNotificationCommunication.initials(for: "  "), "?")
    }

    private func userInfo(
        sender: [String: Any] = [
            "id": "agent_1", "kind": "agent", "name": "Blippy",
            "avatarUrl": "https://haus.chat/api/avatars/a1",
        ],
        conversation: [String: Any] = ["kind": "dm", "name": NSNull()],
        reason: String? = nil
    ) -> [AnyHashable: Any] {
        var info: [AnyHashable: Any] = [
            "serverId": "server_1",
            "chatId": "chat_dm",
            "conversationChatId": "chat_dm",
            "messageId": "message_9",
            "sender": sender,
            "conversation": conversation,
        ]
        if let reason { info["reason"] = reason }
        return info
    }
}
