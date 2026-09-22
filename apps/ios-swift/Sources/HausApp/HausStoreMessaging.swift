import Foundation
import HausModels
import HausUI

extension HausStore {
    func threadChatID(parentChatID: String, anchorMessageID: String) -> String? {
        messagesByChatID[parentChatID]?.threads.first {
            $0.anchorMessageID == anchorMessageID
        }?.threadChatID
    }

    /// Local-only key for optimistic replies before Server creates the child
    /// Chat. This value must never be sent to a Server procedure.
    func pendingThreadChatID(anchorMessageID: String) -> String {
        "thread-pending:\(anchorMessageID)"
    }

    @discardableResult
    func send(
        _ content: String,
        to chatID: String,
        attachments: [ComposerAttachment] = [],
        replyToMessageID: String? = nil,
        replyPreview: MessageReplyReferencePresentation? = nil,
        threadAnchorMessageID: String? = nil,
        pendingChatID: String? = nil
    ) async -> Bool {
        await sendReceipt(
            content,
            to: chatID,
            attachments: attachments,
            replyToMessageID: replyToMessageID,
            replyPreview: replyPreview,
            threadAnchorMessageID: threadAnchorMessageID,
            pendingChatID: pendingChatID
        ) != nil
    }

    /// Sends a Thread reply through the parent Chat and returns the canonical
    /// child Chat id created (or found) by Server. The child id is deliberately
    /// receipt-backed: the iPhone client must never derive or invent one while
    /// the first reply is in flight.
    @discardableResult
    func sendThreadReply(
        _ content: String,
        to parentChatID: String,
        anchorMessageID: String,
        pendingChatID: String? = nil,
        attachments: [ComposerAttachment] = []
    ) async -> String? {
        let receipt = await sendReceipt(
            content,
            to: parentChatID,
            attachments: attachments,
            replyToMessageID: nil,
            replyPreview: nil,
            threadAnchorMessageID: anchorMessageID,
            pendingChatID: pendingChatID
        )
        return receipt?.threadChatID
    }

    private func sendReceipt(
        _ content: String,
        to chatID: String,
        attachments: [ComposerAttachment],
        replyToMessageID: String?,
        replyPreview: MessageReplyReferencePresentation?,
        threadAnchorMessageID: String?,
        pendingChatID: String?
    ) async -> SendReceipt? {
        guard let serverID = activeServer?.id else { return nil }
        let content = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty || !attachments.isEmpty else { return nil }

        let nonce = UUID().uuidString.lowercased()
        let pendingChatID = pendingChatID ?? chatID
        if messagesByChatID[pendingChatID]?.nextAfterSequence != nil {
            guard await loadHistory(chatID: pendingChatID, direction: .latest) else { return nil }
        }
        historyNavigation.followingLatest[pendingChatID] = true
        pendingMessagesByChatID[pendingChatID, default: []].append(
            PendingChatMessage(
                attachments: attachments,
                chatID: pendingChatID,
                content: content,
                createdAt: .now,
                nonce: nonce,
                inlineReply: replyPreview
            )
        )
        sendError = nil

        do {
            // Attachments are reserved in the Chat the composer is anchored in,
            // which for a Thread reply is the parent Chat — a first reply has no
            // Thread chat id yet. Server re-homes them to the Thread the reply
            // lands in, exactly as it does for the web composer.
            let uploadedAttachments = try await uploadAttachments(
                attachments,
                serverID: serverID,
                chatID: chatID
            )
            let receipt: SendReceipt = try await client.mutation(
                "chat.send",
                input: ChatSendInput(
                    serverId: serverID,
                    chatId: chatID,
                    content: content,
                    nonce: nonce,
                    attachmentIds: uploadedAttachments.map(\.id),
                    replyToMessageId: replyToMessageID,
                    thread: threadAnchorMessageID.map(ChatThreadInput.init(anchorMessageId:))
                )
            )
            // A first reply is optimistically keyed by its anchor (or another
            // temporary route key). Move it to the child Chat returned by
            // Server before loading that page so reconciliation retires the
            // pending row instead of leaving a duplicate in the transcript.
            adoptPendingMessages(from: pendingChatID, to: receipt.message.chatID)
            // Server has named the message, so the optimistic row can carry the
            // canonical id before its page is refetched. The row keeps one
            // transcript identity from here through the durable row that
            // replaces it.
            adoptSentMessageID(receipt.message.id, nonce: nonce, in: receipt.message.chatID)
            await loadMessages(chatID: receipt.message.chatID)
            await markChatReadIfNeeded(chatID: receipt.message.chatID)
            if threadAnchorMessageID != nil {
                // Thread sends are addressed to the parent Chat plus anchor. Refresh both
                // pages because the receipt lives in the child Chat while its reply count
                // is projected onto the parent anchor.
                await loadMessages(chatID: chatID)
            }
            // The send receipt is the durable acknowledgement. A projection
            // refresh can race with the event stream; it must not turn an
            // accepted message back into a failed mutation or strand the
            // optimistic row after it has been moved to the canonical Chat.
            try? await reloadChats(serverID: serverID)
            return receipt
        } catch {
            // Another in-flight send can adopt this row into the canonical
            // child before this mutation fails. Remove by nonce across both
            // the provisional and canonical keys.
            removePendingMessage(nonce: nonce)
            sendError = error.localizedDescription
            return nil
        }
    }

    /// Resolves an attachment to a readable file, downloading it at most once.
    ///
    /// The returned URL belongs to either the composer's staged file or the
    /// attachment cache. Callers render or preview it and never delete it.
    func downloadAttachment(_ attachment: MessageAttachmentPresentation) async throws -> URL {
        if let localURL = attachment.localURL { return localURL }
        guard let serverID = activeServer?.id else { throw HausStoreError.serverUnavailable }
        let client = self.client
        let attachmentID = attachment.id
        let filename = attachment.filename
        return try await attachmentFiles.file(
            serverID: serverID,
            attachmentID: attachmentID,
            displayFilename: filename
        ) {
            try await client.downloadAttachment(
                serverID: serverID,
                attachmentID: attachmentID,
                displayFilename: filename
            )
        }
    }

    private func uploadAttachments(
        _ attachments: [ComposerAttachment],
        serverID: String,
        chatID: String
    ) async throws -> [AttachmentMetadata] {
        var uploaded: [AttachmentMetadata] = []
        uploaded.reserveCapacity(attachments.count)
        for attachment in attachments {
            let reservation: AttachmentReservation = try await client.mutation(
                "attachment.reserve",
                input: AttachmentReserveInput(
                    chatId: chatID,
                    filename: attachment.filename,
                    mediaType: attachment.mediaType,
                    nonce: attachment.id,
                    serverId: serverID
                )
            )
            guard attachment.sizeBytes <= reservation.maxSizeBytes else {
                throw AttachmentSendError.tooLarge(filename: attachment.filename)
            }
            let result = try await client.uploadAttachment(
                serverID: serverID,
                attachmentID: reservation.attachmentId,
                fileURL: attachment.localURL
            )
            uploaded.append(result.attachment)
        }
        return uploaded
    }

    func reloadChats(serverID: String) async throws {
        let refreshed: [ChatSummary] = try await client.query(
            "chat.list",
            input: ServerScopedInput(serverId: serverID)
        )
        // Events, sends, and reads all land here, and most of those reads come
        // back byte-identical. A freshly decoded equal value is still a write
        // Observation reports, which is what reshuffled the sidebar mid-gesture;
        // the `chats` setter drops it.
        chats = refreshed
    }
}

private enum AttachmentSendError: LocalizedError {
    case tooLarge(filename: String)

    var errorDescription: String? {
        switch self {
        case .tooLarge(let filename): "\(filename) exceeds the Server’s attachment limit."
        }
    }
}
