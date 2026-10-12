import Foundation
import XCTest
@testable import HausModels

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

    /// `activeWorkLocations.workThread` in `cloud-agent-work-fixture.ts`.
    func testDecodesServerWideActiveCloudAgentWork() throws {
        let json = """
        [{"chatKind":"dm","chatName":null,"chatPeerUserId":"user_2",
          "conversationChatId":"chat_1",
          "location":{"anchorMessageId":"message_work","kind":"work-thread","threadChatId":"cht_work_thread"},
          "work":\(workJSON)}]
        """

        let rows = try HausJSON.decoder().decode([ActiveCloudAgentWork].self, from: Data(json.utf8))
        let row = try XCTUnwrap(rows.first)

        XCTAssertEqual(row.id, "work_1")
        XCTAssertEqual(row.work.status, .running)
        XCTAssertTrue(row.work.status.isActive)
        XCTAssertEqual(row.work.activity?.summary, "Reading the diff")
        XCTAssertEqual(row.conversationChatID, "chat_1")
        XCTAssertEqual(row.chatKind, .dm)
        XCTAssertEqual(row.chatPeerUserID, "user_2")
        XCTAssertEqual(row.location, .workThread(threadChatID: "cht_work_thread", anchorMessageID: "message_work"))
    }

    /// `location` is the only way a row says where it opens.
    func testRejectsARowWithoutALocation() {
        let json = """
        {"chatKind":"channel","chatName":"product","chatPeerUserId":null,
         "conversationChatId":"chat_1","threadChatId":"chat_thread","work":\(workJSON)}
        """

        XCTAssertThrowsError(try HausJSON.decoder().decode(ActiveCloudAgentWork.self, from: Data(json.utf8)))
    }

    /// `activeWorkLocations.message`: the newest visible link, after the launch
    /// Chat is gone.
    func testDecodesAMessageLocation() throws {
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
    }

    func testRejectsAnUnknownLocationKind() {
        let json = """
        {"chatKind":"channel","chatName":null,"chatPeerUserId":null,"conversationChatId":"chat_1",
         "location":{"kind":"elsewhere"},"work":\(workJSON)}
        """

        XCTAssertThrowsError(try HausJSON.decoder().decode(ActiveCloudAgentWork.self, from: Data(json.utf8))) {
            XCTAssertEqual($0 as? ActiveCloudAgentWorkLocation.UnknownKind, .init(kind: "elsewhere"))
        }
    }

    /// A Message in a Thread names its Channel as `chatId` and the Thread as
    /// `threadChatId`; the row decodes both as sent.
    func testMessageLocationInAThreadKeepsTheChannelAndThread() throws {
        let json = """
        {"chatKind":"channel","chatName":"tech-ops","chatPeerUserId":null,
         "conversationChatId":"cht_tech_ops",
         "location":{"chatId":"cht_tech_ops","kind":"message","messageId":"msg_reply","threadChatId":"cht_reply_thread"},
         "work":\(workJSON)}
        """

        let row = try HausJSON.decoder().decode(ActiveCloudAgentWork.self, from: Data(json.utf8))

        XCTAssertEqual(
            row.location,
            .message(chatID: "cht_tech_ops", messageID: "msg_reply", threadChatID: "cht_reply_thread")
        )
    }

    /// A newer location kind skips only its own row; "Happening now" keeps the rest.
    func testListSkipsARowWithAnUnknownLocationKind() throws {
        let unknown = """
        {"chatKind":"channel","chatName":null,"chatPeerUserId":null,"conversationChatId":"chat_1",
         "location":{"kind":"elsewhere"},"work":\(workJSON)}
        """
        let known = """
        {"chatKind":"channel","chatName":"tech-ops","chatPeerUserId":null,
         "conversationChatId":"cht_tech_ops",
         "location":{"chatId":"cht_tech_ops","kind":"message","messageId":"msg_linking_elsewhere","threadChatId":null},
         "work":\(workJSON)}
        """

        let list = try HausJSON.decoder().decode(
            ActiveCloudAgentWorkList.self,
            from: Data("[\(unknown),\(known),\(unknown)]".utf8)
        )

        XCTAssertEqual(list.rows.map(\.conversationChatID), ["cht_tech_ops"])
    }

    func testListStillFailsOnAMalformedRow() {
        let malformed = """
        {"chatKind":"channel","chatName":null,"chatPeerUserId":null,"work":\(workJSON)}
        """

        XCTAssertThrowsError(
            try HausJSON.decoder().decode(ActiveCloudAgentWorkList.self, from: Data("[\(malformed)]".utf8))
        )
    }
}

