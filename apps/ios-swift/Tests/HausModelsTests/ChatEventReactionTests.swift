import Foundation
import XCTest
@testable import HausModels

final class ChatEventReactionTests: XCTestCase {
    /// Regression: an unknown event type failed the whole `chat.onEvent` frame
    /// and the catch-up page, which dropped the stream on every reaction.
    func testDecodesTheReactionEvent() throws {
        let json = """
        {"chatId":"chat_1","createdAt":"2026-09-30T12:00:00.000Z","cursor":"42","id":"event_1",
         "messageId":"message_1","parentChatId":null,"sequence":7,"serverId":"server_1",
         "type":"message.reaction.updated"}
        """
        let event = try HausJSON.decoder().decode(ChatEvent.self, from: Data(json.utf8))

        XCTAssertEqual(event.type, .messageReactionUpdated)
        XCTAssertEqual(event.messageID, "message_1")
    }
}
