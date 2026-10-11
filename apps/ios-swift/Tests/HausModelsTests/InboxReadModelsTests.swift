import Foundation
import XCTest
@testable import HausModels

private func messageJSON(id: String, sequence: Int) -> String {
    """
    {"attachments":[],"author":{"agentId":"agent_1","kind":"agent","profile":null},
     "chatId":"chat_1","content":"Ship the iPhone build","createdAt":"2026-09-11T09:00:00.000Z",
     "id":"\(id)","nonce":"nonce_\(id)","runId":null,"sequence":\(sequence),
     "serverId":"server_1","task":null}
    """
}

private let workJSON = """
{"activity":{"at":"2026-09-11T09:05:00.000Z","summary":"Reading the diff"},
 "agentId":"agent_1","cancelRequestedAt":null,"chatId":"chat_thread",
 "createdAt":"2026-09-11T09:00:00.000Z","id":"work_1","messageId":"message_work",
 "job":{"followUp":null,"startedAt":"2026-09-11T09:01:00.000Z","state":"working"},
 "provider":"cursor","providerUrl":"https://cursor.com/work_1","repository":"zknicker/haus",
 "runs":[],"startedAt":"2026-09-11T09:01:00.000Z","startingRef":"main","status":"running",
 "terminalAt":null,"title":"Ship the iPhone build","updatedAt":"2026-09-11T09:05:00.000Z"}
"""

/// The two Server-wide Inbox reads: the Chat list's quoted
/// last line, and the Cloud Agent work running right now.
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

    func testDecodesServerWideActiveCloudAgentWork() throws {
        let json = """
        [{"chatKind":"channel","chatName":"product","chatPeerUserId":null,
          "conversationChatId":"chat_1",
          "message":\(messageJSON(id: "message_work", sequence: 12)),
          "threadAnchorMessage":null,"threadChatId":"chat_thread","work":\(workJSON)}]
        """

        let rows = try HausJSON.decoder().decode([ActiveCloudAgentWork].self, from: Data(json.utf8))
        let row = try XCTUnwrap(rows.first)

        XCTAssertEqual(row.id, "work_1")
        XCTAssertEqual(row.work.status, .running)
        XCTAssertTrue(row.work.status.isActive)
        XCTAssertEqual(row.work.activity?.summary, "Reading the diff")
        XCTAssertEqual(row.conversationChatID, "chat_1")
        // A Server without `location` implies the launch work Thread.
        XCTAssertEqual(row.location, .workThread(threadChatID: "chat_thread", anchorMessageID: "message_work"))
        XCTAssertEqual(row.carriedThreadAnchor?.id, "message_work")
    }

    func testLegacyRowPrefersTheThreadAnchorMessage() throws {
        let json = """
        {"chatKind":"dm","chatName":null,"chatPeerUserId":"user_2",
         "conversationChatId":"chat_1",
         "message":\(messageJSON(id: "message_work", sequence: 12)),
         "threadAnchorMessage":\(messageJSON(id: "message_anchor", sequence: 4)),
         "threadChatId":"chat_thread","work":\(workJSON)}
        """

        let row = try HausJSON.decoder().decode(ActiveCloudAgentWork.self, from: Data(json.utf8))

        XCTAssertEqual(row.location, .workThread(threadChatID: "chat_thread", anchorMessageID: "message_anchor"))
        XCTAssertEqual(row.carriedThreadAnchor?.id, "message_anchor")
        XCTAssertEqual(row.chatKind, .dm)
        XCTAssertEqual(row.chatPeerUserID, "user_2")
    }

    /// `activeWorkLocations.workThread` in `cloud-agent-work-fixture.ts`.
    func testWorkThreadLocationWinsOverTheLegacyFields() throws {
        let json = """
        {"chatKind":"channel","chatName":"product","chatPeerUserId":null,
         "conversationChatId":"chat_1",
         "location":{"anchorMessageId":"message_work","kind":"work-thread","threadChatId":"cht_work_thread"},
         "message":\(messageJSON(id: "message_work", sequence: 12)),
         "threadAnchorMessage":null,"threadChatId":"chat_thread","work":\(workJSON)}
        """

        let row = try HausJSON.decoder().decode(ActiveCloudAgentWork.self, from: Data(json.utf8))

        XCTAssertEqual(row.location, .workThread(threadChatID: "cht_work_thread", anchorMessageID: "message_work"))
    }

    /// `activeWorkLocations.message`: the newest visible link, after the launch
    /// Chat is gone. The contraction slice drops the legacy fields, so the row
    /// must decode without them.
    func testMessageLocationDecodesWithoutTheLegacyFields() throws {
        let json = """
        {"chatKind":"channel","chatName":"tech-ops","chatPeerUserId":null,
         "conversationChatId":"cht_tech_ops",
         "location":{"chatId":"cht_tech_ops","kind":"message","messageId":"msg_linking_elsewhere","threadChatId":null},
         "work":\(workJSON)}
        """

        let row = try HausJSON.decoder().decode(ActiveCloudAgentWork.self, from: Data(json.utf8))

        XCTAssertEqual(
            row.location,
            .message(chatID: "cht_tech_ops", messageID: "msg_linking_elsewhere", threadChatID: nil)
        )
        XCTAssertNil(row.message)
        XCTAssertNil(row.carriedThreadAnchor)
    }

    func testRejectsAnUnknownLocationKind() {
        let json = """
        {"chatKind":"channel","chatName":null,"chatPeerUserId":null,"conversationChatId":"chat_1",
         "location":{"kind":"elsewhere"},"work":\(workJSON)}
        """

        XCTAssertThrowsError(try HausJSON.decoder().decode(ActiveCloudAgentWork.self, from: Data(json.utf8)))
    }
}

