import Foundation
import XCTest
@testable import HausModels

/// The same `openAskSchema` shape the Ask decoder fixtures use, narrowed to
/// what an answer is addressed by.
private let askJSON = """
{"addresseeUserId":"user_1","agentId":"agent_marlow","answerMessageId":null,
 "answeredAt":null,"answeredBy":null,"chatId":"chat_product",
 "createdAt":"2026-09-10T18:04:00.000Z","id":"ask_1","messageId":"message_ask",
 "options":["Yes, rename it","Keep #product","Not now"],
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

private func openAsk(threadAnchor: String?) throws -> OpenAsk {
    let json = """
    {"ask":\(askJSON),"chatKind":"channel","chatName":"product","chatPeerUserId":null,
     "conversationChatId":"chat_product",
     "message":\(messageJSON(id: "message_ask", chatID: "chat_product", sequence: 12)),
     "threadAnchorMessage":\(threadAnchor ?? "null"),"threadChatId":"chat_thread"}
    """
    return try HausJSON.decoder().decode(OpenAsk.self, from: Data(json.utf8))
}

final class AskAnswerRouteTests: XCTestCase {
    /// A top-level Ask anchors its own Thread, and the answer is still
    /// addressed to the conversation rather than to the Thread's own Chat.
    func testAnswersTheConversationAtTheAskMessage() throws {
        let route = AskAnswerRoute(try openAsk(threadAnchor: nil))

        XCTAssertEqual(route.chatID, "chat_product")
        XCTAssertEqual(route.anchorMessageID, "message_ask")
    }

    /// An Ask posted inside a Thread answers to that Thread's anchor, never to
    /// the Ask Message itself.
    func testAnswersAtTheThreadAnchorWhenTheAskWasPostedInOne() throws {
        let anchorJSON = messageJSON(id: "message_anchor", chatID: "chat_product", sequence: 4)
        let route = AskAnswerRoute(try openAsk(threadAnchor: anchorJSON))

        XCTAssertEqual(route.chatID, "chat_product")
        XCTAssertEqual(route.anchorMessageID, "message_anchor")
    }

    /// The Thread's own Chat id is what an answer must never be addressed to,
    /// so it is asserted as an exclusion rather than only implied.
    func testNeverAddressesTheThreadsOwnChat() throws {
        let ask = try openAsk(threadAnchor: nil)

        XCTAssertNotEqual(AskAnswerRoute(ask).chatID, ask.threadChatID)
    }
}
