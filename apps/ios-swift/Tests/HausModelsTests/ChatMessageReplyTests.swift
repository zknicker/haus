import Foundation
import XCTest
@testable import HausModels

final class ChatMessageReplyTests: XCTestCase {
    func testDecodesAnInlineReplyAndKeepsOlderMessagesWithoutReplyContextCompatible() throws {
        let message = try HausJSON.decoder().decode(
            ChatMessage.self,
            from: Data(
                """
                {"attachments":[],"author":{"kind":"human","userId":"user_2"},"body":{"kind":"text"},"chatId":"chat_1","content":"A follow-up.","createdAt":"2026-08-15T14:00:02Z","id":"message_2","nonce":"nonce_2","reply":{"parent":{"author":{"kind":"human","userId":"user_1","profile":{"avatarUrl":null,"deleted":false,"description":null,"displayName":"Zach"}},"content":"Please review this.","createdAt":"2026-08-15T14:00:00Z","id":"message_1","sequence":1},"parentMessageId":"message_1","root":{"author":{"kind":"human","userId":"user_1"},"content":"Please review this.","createdAt":"2026-08-15T14:00:00Z","id":"message_1","sequence":1},"rootMessageId":"message_1"},"runId":null,"sequence":2,"serverId":"server_1","sessionGeneration":null}
                """.utf8
            )
        )

        XCTAssertEqual(message.reply?.parentMessageID, "message_1")
        XCTAssertEqual(message.reply?.rootMessageID, "message_1")
        XCTAssertEqual(message.reply?.parent.content, "Please review this.")
        XCTAssertEqual(message.reply?.parent.sequence, 1)

        let legacy = try HausJSON.decoder().decode(
            ChatMessage.self,
            from: Data(
                """
                {"attachments":[],"author":{"kind":"human","userId":"user_1"},"body":{"kind":"text"},"chatId":"chat_1","content":"An older message.","createdAt":"2026-08-15T14:00:00Z","id":"message_1","nonce":"nonce_1","runId":null,"sequence":1,"serverId":"server_1"}
                """.utf8
            )
        )

        XCTAssertNil(legacy.reply)
    }
}
