import Foundation
import XCTest
@testable import HausModels

/// The Chat list's quoted last line, which Home's rows read.
final class InboxReadModelsTests: XCTestCase {
    func testDecodesTheChatListsQuotedLastMessage() throws {
        let json = """
        {"archivedAt":null,"archivedByUserId":null,"color":null,
         "createdAt":"2026-09-01T00:00:00Z","icon":null,"id":"chat_1","isAll":false,
         "kind":"channel","lastActivityAt":"2026-09-11T09:00:00.000Z",
         "lastMessage":{"authorDisplayName":"Marlow","content":"**Ship** the iPhone build",
           "createdAt":"2026-09-11T09:00:00.000Z"},
         "lastMessageSequence":12,"name":"product","participantAgentIds":[],
         "participantUserIds":["user_1"],"peerAgentDisplayName":null,"peerAgentId":null,
         "peerAgentRetired":false,"peerUserId":null,"serverId":"server_1","unreadCount":0}
        """

        let chat = try HausJSON.decoder().decode(ChatSummary.self, from: Data(json.utf8))
        let lastMessage = try XCTUnwrap(chat.lastMessage)

        XCTAssertEqual(lastMessage.authorDisplayName, "Marlow")
        // Raw Markdown: collapsing it to one plain line is the reader's job.
        XCTAssertEqual(lastMessage.content, "**Ship** the iPhone build")
        XCTAssertEqual(lastMessage.createdAt, HausISO8601.date(from: "2026-09-11T09:00:00.000Z"))
    }

    func testAChatWithNoLastMessageDecodesWithoutOne() throws {
        let json = """
        {"archivedAt":null,"archivedByUserId":null,"color":null,
         "createdAt":"2026-09-01T00:00:00Z","icon":null,"id":"chat_1","isAll":false,
         "kind":"channel","lastActivityAt":null,"lastMessage":null,"lastMessageSequence":0,
         "name":"product","participantAgentIds":[],"participantUserIds":["user_1"],
         "peerAgentDisplayName":null,"peerAgentId":null,"peerAgentRetired":false,
         "peerUserId":null,"serverId":"server_1","unreadCount":0}
        """

        let chat = try HausJSON.decoder().decode(ChatSummary.self, from: Data(json.utf8))

        XCTAssertNil(chat.lastMessage)
    }
}
