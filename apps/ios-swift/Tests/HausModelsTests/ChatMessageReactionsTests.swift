import Foundation
import XCTest
@testable import HausModels

final class ChatMessageReactionsTests: XCTestCase {
    func testDecodesGroupedReactions() throws {
        let message = try decodeMessage(reactions: """
        [
          {"emoji": "👍", "actors": [
            {"handle": "tiny", "id": "agent_tiny", "kind": "agent"},
            {"handle": null, "id": "user_1", "kind": "human"}
          ]},
          {"emoji": "❤️", "actors": [{"handle": null, "id": "user_1", "kind": "human"}]}
        ]
        """)

        XCTAssertEqual(message.reactions.map(\.emoji), ["👍", "❤️"])
        XCTAssertEqual(message.reactions[0].actors.map(\.id), ["agent_tiny", "user_1"])
        XCTAssertEqual(message.reactions[0].actors[0].kind, .agent)
        XCTAssertNil(message.reactions[0].actors[1].handle)
    }

    func testAMessageWithoutReactionsDecodesEmpty() throws {
        XCTAssertEqual(try decodeMessage(reactions: nil).reactions, [])
    }

    func testReplacingReactionsPatchesOnlyThatMessage() throws {
        let message = try decodeMessage(reactions: nil)
        let page = ChatMessagePage(messages: [message], nextBeforeSequence: nil, threads: [])
        let thumbs = [ChatMessageReaction(actors: [.init(id: "user_1", kind: .human)], emoji: "👍")]

        let patched = try XCTUnwrap(page.replacingReactions(thumbs, messageID: "message_1"))
        XCTAssertEqual(patched.messages[0].reactions, thumbs)
        XCTAssertNil(patched.replacingReactions(thumbs, messageID: "message_1"))
        XCTAssertNil(page.replacingReactions(thumbs, messageID: "missing"))
    }

    func testEncodesTheReactInput() throws {
        let input = ChatMessageReactionInput(emoji: "👍", messageID: "m", remove: true, serverID: "s")
        let object = try JSONSerialization.jsonObject(with: HausJSON.encoder().encode(input)) as? [String: Any]

        XCTAssertEqual(object?["messageId"] as? String, "m")
        XCTAssertEqual(object?["serverId"] as? String, "s")
        XCTAssertEqual(object?["remove"] as? Bool, true)
    }

    private func decodeMessage(reactions: String?) throws -> ChatMessage {
        let entry = reactions.map { "\"reactions\": \($0)," } ?? ""
        let json = """
        {
          \(entry)
          "attachments": [],
          "author": {"kind":"human","userId":"user_1"},
          "chatId": "chat_1",
          "content": "thanks, that's perfect!",
          "createdAt": "2026-09-30T12:00:00Z",
          "id": "message_1",
          "nonce": "nonce_1",
          "runId": null,
          "sequence": 1,
          "serverId": "server_1"
        }
        """
        return try HausJSON.decoder().decode(ChatMessage.self, from: Data(json.utf8))
    }
}
