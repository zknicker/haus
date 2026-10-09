import Foundation
@testable import HausModels

/// Messages, Thread summaries, and pages for the transcript cache tests.
enum TranscriptFixture {
    static func message(
        _ id: String,
        sequence: Int,
        chatID: String = "chat_1",
        content: String = "message",
        reaction: String? = nil,
        labelID: String? = nil
    ) -> ChatMessage {
        let reactions = reaction.map {
            #","reactions":[{"emoji":"\#($0)","actors":[{"handle":null,"id":"user_1","kind":"human"}]}]"#
        } ?? ""
        let task = labelID.map {
            #","task":{"assigneeAgentId":null,"chatId":"\#(chatID)","claimedAt":null,"createdAt":"2026-01-01T00:00:00Z","createdByAgentId":null,"createdByUserId":"user_1","labels":[{"color":"blue","id":"\#($0)","name":"Label"}],"live":false,"messageId":"\#(id)","number":1,"origin":"converted","priority":"none","status":"todo","threadChatId":"thread_\#(id)","tier":"tracked","updatedAt":"2026-01-01T00:00:00Z","version":1}"#
        } ?? ""
        let json = """
        {"attachments":[],"author":{"agentId":"agent_1","kind":"agent"},"chatId":"\(chatID)",
         "content":"\(content)","createdAt":"2026-01-01T00:00:00Z","id":"\(id)","nonce":"nonce_\(id)",
         "runId":null,"sequence":\(sequence),"serverId":"server_1"\(reactions)\(task)}
        """
        // Fixtures are static strings; a decoding failure is a test bug.
        // swiftlint:disable:next force_try
        return try! HausJSON.decoder().decode(ChatMessage.self, from: Data(json.utf8))
    }

    static func thread(anchor: String, replyCount: Int = 1, unreadCount: Int = 0, followed: Bool = false) -> ThreadSummary {
        ThreadSummary(
            anchorMessageID: anchor,
            followed: followed,
            latestReplyAt: nil,
            recentReplies: [],
            replyCount: replyCount,
            threadChatID: "thread_\(anchor)",
            unreadCount: unreadCount
        )
    }

    static func page(
        _ messages: [ChatMessage],
        nextBefore: Int? = nil,
        nextAfter: Int? = nil,
        scannedThrough: Int? = nil,
        threads: [ThreadSummary] = []
    ) -> ChatMessagePage {
        ChatMessagePage(
            messages: messages,
            nextBeforeSequence: nextBefore,
            nextAfterSequence: nextAfter,
            scannedThroughSequence: scannedThrough,
            threads: threads
        )
    }

    static func messages(_ sequences: ClosedRange<Int>, chatID: String = "chat_1") -> [ChatMessage] {
        sequences.map { message("m\($0)", sequence: $0, chatID: chatID) }
    }
}
