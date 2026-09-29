import Foundation
import XCTest
@testable import HausModels

final class NeedsYouModelsTests: XCTestCase {
    func testDecodesAMentionInAThread() throws {
        let row = try decode(
            """
            {"addressedCount":2,"chatId":"chat_thread","chatKind":"channel","chatName":"product",
             "conversationChatId":"chat_1","reason":"mention","threadAnchorMessageId":"message_anchor",
             "latest":\(latest)}
            """
        )

        XCTAssertEqual(row.id, "chat_thread")
        XCTAssertEqual(row.reason, .mention(chatName: "product"))
        XCTAssertTrue(row.isThread)
        XCTAssertEqual(row.latest.sequence, 9)
        XCTAssertEqual(row.latest.author, .agent(agentID: "agent_1", profile: nil))
    }

    func testDecodesAnInlineReplyToTheViewer() throws {
        let row = try decode(
            """
            {"addressedCount":1,"chatId":"chat_1","chatKind":"channel","chatName":"product",
             "conversationChatId":"chat_1","reason":"reply","threadAnchorMessageId":null,
             "latest":\(latest)}
            """
        )

        XCTAssertEqual(row.reason, .reply(chatName: "product"))
        XCTAssertFalse(row.isThread)
        XCTAssertThrowsError(
            try decode(
                """
                {"addressedCount":1,"chatId":"chat_dm","chatKind":"dm","chatPeerAgentId":"agent_1",
                 "chatPeerUserId":null,"conversationChatId":"chat_dm","reason":"reply",
                 "threadAnchorMessageId":null,"latest":\(latest)}
                """
            )
        )
    }

    func testDecodesATopLevelDM() throws {
        let row = try decode(
            """
            {"addressedCount":1,"chatId":"chat_dm","chatKind":"dm","chatPeerAgentId":null,"chatPeerUserId":"user_2",
             "conversationChatId":"chat_dm","reason":"dm","threadAnchorMessageId":null,
             "latest":\(latest)}
            """
        )

        XCTAssertEqual(row.reason, .dm(peerUserID: "user_2", peerAgentID: nil))
        XCTAssertFalse(row.isThread)
    }

    /// An Agent DM, the common case, has a peer Agent and no peer human.
    func testDecodesAnAgentDM() throws {
        let row = try decode(
            """
            {"addressedCount":1,"chatId":"chat_dm","chatKind":"dm","chatPeerAgentId":"agent_1",
             "chatPeerUserId":null,"conversationChatId":"chat_dm","reason":"dm",
             "threadAnchorMessageId":null,"latest":\(latest)}
            """
        )

        XCTAssertEqual(row.reason, .dm(peerUserID: nil, peerAgentID: "agent_1"))
        XCTAssertEqual(row.latest.author, .agent(agentID: "agent_1", profile: nil))
    }

    /// The contract's refine and the reason/kind pairing are enforced here too.
    func testRejectsARowWhoseShapeContradictsItself() {
        XCTAssertThrowsError(try decode(
            """
            {"addressedCount":1,"chatId":"chat_dm","chatKind":"dm","chatPeerAgentId":null,"chatPeerUserId":"user_2",
             "conversationChatId":"chat_dm","reason":"mention","threadAnchorMessageId":null,
             "latest":\(latest)}
            """
        ))
        XCTAssertThrowsError(try decode(
            """
            {"addressedCount":1,"chatId":"chat_thread","chatKind":"channel","chatName":"product",
             "conversationChatId":"chat_1","reason":"mention","threadAnchorMessageId":null,
             "latest":\(latest)}
            """
        ))
    }

    func testMarkDoneNamesTheRowsChatAndLatestSequence() throws {
        let row = try decode(
            """
            {"addressedCount":1,"chatId":"chat_dm","chatKind":"dm","chatPeerAgentId":null,"chatPeerUserId":"user_2",
             "conversationChatId":"chat_dm","reason":"dm","threadAnchorMessageId":null,
             "latest":\(latest)}
            """
        )
        let data = try JSONEncoder().encode(InboxMarkDoneInput(serverID: "server_1", row: row))
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(object["serverId"] as? String, "server_1")
        XCTAssertEqual(object["chatId"] as? String, "chat_dm")
        XCTAssertEqual(object["throughSequence"] as? Int, 9)
    }

    /// A Done hides its row until the Server answers, unless newer addressing
    /// arrives first — Raft's `throughActivitySeq` rule.
    func testADoneInFlightHidesOnlyWhatItCovered() throws {
        let row = try decode(
            """
            {"addressedCount":1,"chatId":"chat_dm","chatKind":"dm","chatPeerAgentId":null,"chatPeerUserId":"user_2",
             "conversationChatId":"chat_dm","reason":"dm","threadAnchorMessageId":null,
             "latest":\(latest)}
            """
        )

        XCTAssertEqual(NeedsYou.visible([row], doneThrough: [:]).count, 1)
        XCTAssertEqual(NeedsYou.visible([row], doneThrough: ["chat_dm": 9]).count, 0)
        XCTAssertEqual(NeedsYou.visible([row], doneThrough: ["chat_dm": 8]).count, 1)
        XCTAssertEqual(NeedsYou.chatIDs([row]), ["chat_dm"])
    }

    private let latest = """
    {"author":{"agentId":"agent_1","kind":"agent"},"createdAt":"2026-09-29T10:00:00.000Z",
     "messageId":"message_9","preview":"Which window?","sequence":9}
    """

    private func decode(_ json: String) throws -> NeedsYouRow {
        try HausJSON.decoder().decode(NeedsYouRow.self, from: Data(json.utf8))
    }
}
