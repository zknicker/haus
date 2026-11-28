import Foundation
@testable import HausModels

enum TranscriptFixture {
    static func message(
        _ id: String,
        sequence: Int,
        chatID: String = "chat_1",
        content: String = "message",
        reaction: String? = nil
    ) -> ChatMessage {
        let reactions = reaction.map {
            #","reactions":[{"emoji":"\#($0)","actors":[{"handle":null,"id":"user_1","kind":"human"}]}]"#
        } ?? ""
        let json = """
        {"attachments":[],"author":{"agentId":"agent_1","kind":"agent"},"chatId":"\(chatID)",
         "content":"\(content)","createdAt":"2026-01-01T00:00:00Z","id":"\(id)","nonce":"nonce_\(id)",
         "runId":null,"sequence":\(sequence),"serverId":"server_1"\(reactions)}
        """
        // Fixtures are static strings; a decoding failure is a test bug.
        // swiftlint:disable:next force_try
        return try! HausJSON.decoder().decode(ChatMessage.self, from: Data(json.utf8))
    }

    static func task(origin: String, messageCount: Int = 1, unreadCount: Int = 0) -> TaskPreview {
        TaskPreview(
            taskID: "task_\(origin)",
            chatID: "chat_task_\(origin)",
            shortID: "k3mq7xta",
            title: "Task",
            originMessageID: origin,
            messageCount: messageCount,
            unreadCount: unreadCount
        )
    }

    static func page(
        _ messages: [ChatMessage],
        nextBefore: Int? = nil,
        nextAfter: Int? = nil,
        scannedThrough: Int? = nil,
        tasks: [TaskPreview] = []
    ) -> ChatMessagePage {
        ChatMessagePage(
            messages: messages,
            nextBeforeSequence: nextBefore,
            nextAfterSequence: nextAfter,
            scannedThroughSequence: scannedThrough,
            tasks: tasks
        )
    }

    static func messages(_ sequences: ClosedRange<Int>, chatID: String = "chat_1") -> [ChatMessage] {
        sequences.map { message("m\($0)", sequence: $0, chatID: chatID) }
    }
}
