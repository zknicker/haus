import Foundation
import HausModels
import HausUI
import OSLog

extension HausStore {
    /// The anchor's child Chat: from the parent page's Thread summary, or, for a
    /// first reply whose parent page has not refetched yet, the Chat Server
    /// moved the optimistic row into. Without the second, the open Thread read
    /// its emptied provisional key for a beat and jumped back to the anchor.
    func threadChatID(parentChatID: String, anchorMessageID: String) -> String? {
        messagesByChatID[parentChatID]?.threads.first {
            $0.anchorMessageID == anchorMessageID
        }?.threadChatID
            ?? adoptedChatIDs[pendingThreadChatID(anchorMessageID: anchorMessageID)]
    }

    /// Local-only key for optimistic replies before Server creates the child
    /// Chat. This value must never be sent to a Server procedure.
    func pendingThreadChatID(anchorMessageID: String) -> String {
        "thread-pending:\(anchorMessageID)"
    }

    /// True once the message is the viewer's row in the transcript — sent, in
    /// flight, or kept as a failed row to retry. False only when nothing left
    /// the composer (no Server, nothing to send), so the composer keeps it.
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
        await sendOutcome(
            content,
            to: chatID,
            attachments: attachments,
            replyToMessageID: replyToMessageID,
            replyPreview: replyPreview,
            threadAnchorMessageID: threadAnchorMessageID,
            pendingChatID: pendingChatID
        ) != .rejected
    }

    /// Sends a Thread reply through the parent Chat. A sent reply carries the
    /// canonical child Chat id Server created (or found): the iPhone client
    /// must never derive or invent one while the first reply is in flight.
    func sendThreadReply(
        _ content: String,
        to parentChatID: String,
        anchorMessageID: String,
        pendingChatID: String? = nil,
        attachments: [ComposerAttachment] = []
    ) async -> SendOutcome {
        await sendOutcome(
            content,
            to: parentChatID,
            attachments: attachments,
            replyToMessageID: nil,
            replyPreview: nil,
            threadAnchorMessageID: anchorMessageID,
            pendingChatID: pendingChatID
        )
    }

    private func sendOutcome(
        _ content: String,
        to chatID: String,
        attachments: [ComposerAttachment],
        replyToMessageID: String?,
        replyPreview: MessageReplyReferencePresentation?,
        threadAnchorMessageID: String?,
        pendingChatID: String?
    ) async -> SendOutcome {
        guard activeServer?.id != nil else { return .rejected }
        let content = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty || !attachments.isEmpty else { return .rejected }

        let row = PendingChatMessage(
            attachments: attachments,
            chatID: pendingChatID ?? chatID,
            content: content,
            createdAt: .now,
            nonce: UUID().uuidString.lowercased(),
            inlineReply: replyPreview,
            target: .chat(
                chatID: chatID,
                replyToMessageID: replyToMessageID,
                threadAnchorMessageID: threadAnchorMessageID
            )
        )
        // A page scrolled away from the latest messages would put the new row
        // mid-history, so the latest page loads first.
        if messagesByChatID[row.chatID]?.nextAfterSequence != nil,
           !(await loadHistory(chatID: row.chatID, direction: .latest)) {
            pendingMessagesByChatID[row.chatID, default: []].append(row)
            failSend(nonce: row.nonce, reason: "the latest page did not load")
            return .failed
        }
        historyNavigation.followingLatest[row.chatID] = true
        pendingMessagesByChatID[row.chatID, default: []].append(row)
        return await deliver(row)
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

    func uploadAttachments(
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
        async let iconBadge: Void = refreshIconBadge()
        let refreshed: [ChatSummary] = try await client.query(
            "chat.list",
            input: ServerScopedInput(serverId: serverID)
        )
        await iconBadge
        guard activeServer?.id == serverID else { return }
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
