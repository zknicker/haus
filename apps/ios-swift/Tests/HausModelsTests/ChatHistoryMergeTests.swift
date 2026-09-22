import Foundation
import XCTest
@testable import HausModels

final class ChatHistoryMergeTests: XCTestCase {
    func testWindowMergesMessagePagesInSequenceOrderAndDeduplicates() throws {
        let older = ChatMessagePage(
            messages: [
                try message(id: "message_1", sequence: 1, content: "one"),
                try message(id: "message_2", sequence: 2, content: "two"),
                try message(id: "message_3", sequence: 3, content: "stale overlap"),
            ],
            nextBeforeSequence: 1,
            threads: []
        )
        let newest = ChatMessagePage(
            messages: [
                try message(id: "message_3", sequence: 3, content: "authoritative overlap"),
                try message(id: "message_4", sequence: 4, content: "four"),
            ],
            nextBeforeSequence: 3,
            threads: []
        )

        var window = ChatHistoryWindow(page: older)
        window.append(newest)
        let merged = window.page

        XCTAssertEqual(merged.messages.map(\.id), ["message_1", "message_2", "message_3", "message_4"])
        XCTAssertEqual(merged.messages[2].content, "authoritative overlap")
        XCTAssertEqual(merged.nextBeforeSequence, 1)
    }

    private func message(id: String, sequence: Int, content: String) throws -> ChatMessage {
        let json = """
        {
          "attachments": [],
          "author": {"agentId":"agent_cove","kind":"agent","profile":null},
          "chatId":"chat_cove",
          "content":"\(content)",
          "createdAt":"2026-01-01T00:0\(sequence):00Z",
          "id":"\(id)",
          "nonce":"nonce_\(sequence)",
          "runId":null,
          "sequence":\(sequence),
          "serverId":"srv_preview",
          "task":null
        }
        """
        return try HausJSON.decoder().decode(ChatMessage.self, from: Data(json.utf8))
    }
}
