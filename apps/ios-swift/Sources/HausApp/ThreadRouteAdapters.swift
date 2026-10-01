import Foundation
import HausModels
import HausUI
import OSLog

/// The Threads a Server-wide row opens. The Inbox lists records from across
/// the Server, so it opens Threads over Chat pages this client has never
/// loaded, and the anchor must arrive fully projected.
extension HausStore {
    /// The Thread a Server-wide row hangs off, projected from the Message that
    /// row carries rather than from a Chat page.
    func threadSelection(
        conversationChatID: String,
        threadChatID: String,
        anchor: ChatMessage
    ) -> ThreadSelection? {
        guard let author = authorPresentation(anchor.author) else { return nil }
        let (body, fenced) = MessagePresentation.resolvedBody(content: anchor.content)
        return ThreadSelection(
            parentChatID: conversationChatID,
            threadChatID: threadChatID,
            anchor: MessagePresentation(
                id: anchor.id,
                author: author,
                content: body,
                createdAt: anchor.createdAt,
                attachments: [],
                sequence: anchor.sequence,
                visualBody: fenced
            )
        )
    }

    /// The Thread a row or a tapped notification names by ids alone. The
    /// anchor Message is read from the loaded parent page when there is one,
    /// and otherwise fetched around its id. Nil when it cannot be read.
    func threadSelection(
        conversationChatID: String,
        threadChatID: String,
        anchorMessageID: String
    ) async -> ThreadSelection? {
        var anchor = messagesByChatID[conversationChatID]?.messages.first { $0.id == anchorMessageID }
        if anchor == nil {
            anchor = await fetchMessage(chatID: conversationChatID, messageID: anchorMessageID)
        }
        guard let anchor else { return nil }
        return threadSelection(
            conversationChatID: conversationChatID,
            threadChatID: threadChatID,
            anchor: anchor
        )
    }

    /// One Message read on its own, without touching the Chat's loaded window.
    private func fetchMessage(chatID: String, messageID: String) async -> ChatMessage? {
        guard let serverID = activeServer?.id else { return nil }
        do {
            let page: ChatMessagePage = try await client.query(
                "chat.messages",
                input: ChatMessagesInput(
                    serverId: serverID,
                    chatId: chatID,
                    limit: 1,
                    aroundMessageId: messageID
                )
            )
            guard activeServer?.id == serverID else { return nil }
            return page.messages.first { $0.id == messageID }
        } catch {
            Self.logger.error("Loading a thread anchor failed: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }
}
