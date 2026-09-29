import Foundation
import XCTest
@testable import HausModels

final class ChatEventNeedsYouTests: XCTestCase {
    func testMessageCreatedChangesNeedsYouOnlyWhenItCouldAddressTheViewer() throws {
        let mention = try HausJSON.decoder().decode(
            ChatEvent.self,
            from: Data(
                "{\"authorUserId\":null,\"chatId\":\"chat_1\",\"createdAt\":\"2026-08-15T14:00:00Z\",\"cursor\":\"44\",\"id\":\"event_3\",\"mentionedUserIds\":[\"usr_viewer\"],\"messageId\":\"msg_1\",\"parentChatId\":null,\"sequence\":3,\"serverId\":\"server_1\",\"type\":\"message.created\"}".utf8
            )
        )
        XCTAssertEqual(mention.mentionedUserIDs, ["usr_viewer"])
        XCTAssertTrue(mention.mayChangeNeedsYou(viewerUserID: "usr_viewer", conversationKind: .channel))
        XCTAssertFalse(mention.mayChangeNeedsYou(viewerUserID: "usr_other", conversationKind: .channel))
        XCTAssertTrue(mention.mayChangeNeedsYou(viewerUserID: "usr_other", conversationKind: .dm))
        XCTAssertTrue(mention.mayChangeNeedsYou(viewerUserID: "usr_other", conversationKind: nil))
        XCTAssertTrue(mention.mayChangeNeedsYou(viewerUserID: nil, conversationKind: .channel))

        let own = ChatEvent(
            authorUserID: "usr_viewer",
            chatID: "chat_1",
            createdAt: Date(timeIntervalSince1970: 1),
            cursor: "45",
            id: "event_4",
            mentionedUserIDs: [],
            parentChatID: nil,
            sequence: 4,
            serverID: "server_1",
            type: .messageCreated
        )
        XCTAssertTrue(own.mayChangeNeedsYou(viewerUserID: "usr_viewer", conversationKind: .channel))

        let reply = try HausJSON.decoder().decode(
            ChatEvent.self,
            from: Data(
                "{\"authorUserId\":null,\"chatId\":\"chat_1\",\"createdAt\":\"2026-08-15T14:00:00Z\",\"cursor\":\"46\",\"id\":\"event_5\",\"mentionedUserIds\":[],\"messageId\":\"msg_2\",\"parentChatId\":null,\"replyToAuthorUserId\":\"usr_viewer\",\"sequence\":5,\"serverId\":\"server_1\",\"type\":\"message.created\"}".utf8
            )
        )
        XCTAssertEqual(reply.replyToAuthorUserID, "usr_viewer")
        XCTAssertTrue(reply.mayChangeNeedsYou(viewerUserID: "usr_viewer", conversationKind: .channel))
        XCTAssertFalse(reply.mayChangeNeedsYou(viewerUserID: "usr_other", conversationKind: .channel))

        let threadAnswer = try HausJSON.decoder().decode(
            ChatEvent.self,
            from: Data(
                "{\"authorUserId\":null,\"chatId\":\"chat_thread\",\"createdAt\":\"2026-08-15T14:00:00Z\",\"cursor\":\"47\",\"id\":\"event_6\",\"mentionedUserIds\":[],\"messageId\":\"msg_3\",\"parentChatId\":\"chat_1\",\"replyToAuthorUserId\":null,\"sequence\":1,\"serverId\":\"server_1\",\"threadAnchorAuthorUserId\":\"usr_viewer\",\"type\":\"message.created\"}".utf8
            )
        )
        XCTAssertEqual(threadAnswer.threadAnchorAuthorUserID, "usr_viewer")
        XCTAssertTrue(threadAnswer.mayChangeNeedsYou(viewerUserID: "usr_viewer", conversationKind: .channel))
        XCTAssertFalse(threadAnswer.mayChangeNeedsYou(viewerUserID: "usr_other", conversationKind: .channel))
    }
}
