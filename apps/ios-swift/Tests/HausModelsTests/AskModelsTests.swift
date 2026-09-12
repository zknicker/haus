import Foundation
import XCTest
@testable import HausModels

/// Fixtures follow the `openAskSchema` shape exactly, with the Ask the
/// development seed writes into `#product`.
private let askJSON = """
{"addresseeUserId":"user_1","agentId":"agent_marlow","answerMessageId":null,
 "answeredAt":null,"answeredBy":null,"chatId":"chat_product",
 "createdAt":"2026-09-10T18:04:00.000Z","id":"ask_1","messageId":"message_ask",
 "options":["Yes, rename it","Keep #product, pin a note instead","Not now"],
 "status":"open","summary":"Two channels now carry release work.",
 "title":"Rename #product to #launches?"}
"""

private func messageJSON(id: String, chatID: String, sequence: Int) -> String {
    """
    {"attachments":[],"author":{"agentId":"agent_marlow","kind":"agent","profile":null},
     "chatId":"\(chatID)","content":"Rename #product to #launches?",
     "createdAt":"2026-09-10T18:04:00.000Z","id":"\(id)","nonce":"nonce_\(id)",
     "runId":null,"sequence":\(sequence),"serverId":"server_1","task":null}
    """
}

private func openAskJSON(threadAnchor: String?) -> String {
    """
    {"ask":\(askJSON),"chatKind":"channel","chatName":"product","chatPeerUserId":null,
     "conversationChatId":"chat_product",
     "message":\(messageJSON(id: "message_ask", chatID: "chat_product", sequence: 12)),
     "threadAnchorMessage":\(threadAnchor ?? "null"),"threadChatId":"chat_thread"}
    """
}

final class AskModelsTests: XCTestCase {
    func testDecodesAnOpenAskWithItsOptions() throws {
        let row = try HausJSON.decoder().decode(
            OpenAsk.self,
            from: Data(openAskJSON(threadAnchor: nil).utf8)
        )

        XCTAssertEqual(row.id, "ask_1")
        XCTAssertEqual(row.ask.title, "Rename #product to #launches?")
        XCTAssertEqual(row.ask.status, .open)
        XCTAssertEqual(row.ask.addresseeUserID, "user_1")
        XCTAssertEqual(row.ask.agentID, "agent_marlow")
        XCTAssertNil(row.ask.answeredBy)
        XCTAssertEqual(
            row.ask.options,
            ["Yes, rename it", "Keep #product, pin a note instead", "Not now"]
        )
        XCTAssertEqual(row.chatKind, .channel)
        XCTAssertEqual(row.chatName, "product")
        XCTAssertEqual(row.conversationChatID, "chat_product")
        XCTAssertEqual(row.threadChatID, "chat_thread")
    }

    func testDecodesAnAnsweredAskSettlement() throws {
        let json = """
        {"addresseeUserId":"user_1","agentId":"agent_marlow",
         "answerMessageId":"message_answer","answeredAt":"2026-09-10T19:00:00.000Z",
         "answeredBy":{"id":"user_1","kind":"user"},"chatId":"chat_product",
         "createdAt":"2026-09-10T18:04:00.000Z","id":"ask_1","messageId":"message_ask",
         "options":[],"status":"answered","summary":"Two channels now carry release work.",
         "title":"Rename #product to #launches?"}
        """

        let ask = try HausJSON.decoder().decode(Ask.self, from: Data(json.utf8))

        XCTAssertEqual(ask.status, .answered)
        XCTAssertEqual(ask.answerMessageID, "message_answer")
        XCTAssertEqual(ask.answeredBy, AskAnsweredBy(id: "user_1", kind: .user))
        XCTAssertEqual(ask.answeredAt, HausISO8601.date(from: "2026-09-10T19:00:00.000Z"))
        // Zero options is an open question: the answer is whatever the human writes.
        XCTAssertTrue(ask.options.isEmpty)
    }

    /// The port of the shared `openAskThreadAnchor` helper: a top-level Ask
    /// anchors its own Thread, and an Ask posted inside one answers to the
    /// Thread's anchor instead.
    func testThreadAnchorFallsBackToTheAskMessage() throws {
        let topLevel = try HausJSON.decoder().decode(
            OpenAsk.self,
            from: Data(openAskJSON(threadAnchor: nil).utf8)
        )
        XCTAssertEqual(topLevel.threadAnchor.id, "message_ask")

        let anchorJSON = messageJSON(id: "message_anchor", chatID: "chat_product", sequence: 4)
        let inThread = try HausJSON.decoder().decode(
            OpenAsk.self,
            from: Data(openAskJSON(threadAnchor: anchorJSON).utf8)
        )
        XCTAssertEqual(inThread.threadAnchor.id, "message_anchor")
        XCTAssertEqual(inThread.message.id, "message_ask")
    }

    func testDecodesTheAskMessageBody() throws {
        let json = """
        {"attachments":[],"author":{"agentId":"agent_marlow","kind":"agent","profile":null},
         "body":{"ask":\(askJSON),"kind":"ask"},
         "chatId":"chat_product","content":"Rename #product to #launches?",
         "createdAt":"2026-09-10T18:04:00.000Z","id":"message_ask","nonce":"nonce_1",
         "runId":null,"sequence":12,"serverId":"server_1","task":null}
        """

        let message = try HausJSON.decoder().decode(ChatMessage.self, from: Data(json.utf8))

        guard case .ask(let ask) = message.body else {
            return XCTFail("Expected an ask body, got \(String(describing: message.body)).")
        }
        XCTAssertEqual(ask.id, "ask_1")
        XCTAssertEqual(ask.options.count, 3)
    }

    func testDecodesAnAskUpdatedDurableEvent() throws {
        let json = """
        {"askId":"ask_1","chatId":"chat_thread","createdAt":"2026-09-10T19:00:00.000Z",
         "cursor":"42","id":"event_1","messageId":"message_ask","parentChatId":"chat_product",
         "sequence":3,"serverId":"server_1","type":"ask.updated"}
        """

        let event = try HausJSON.decoder().decode(ChatEvent.self, from: Data(json.utf8))

        XCTAssertEqual(event.type, .askUpdated)
        XCTAssertEqual(event.askID, "ask_1")
        XCTAssertEqual(event.chatID, "chat_thread")
        XCTAssertEqual(event.parentChatID, "chat_product")
        XCTAssertEqual(event.messageID, "message_ask")
    }
}
