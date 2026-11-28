import Foundation
import HausModels
import HausTransport
import HausUI
import OSLog
#if canImport(UIKit)
import UIKit
#endif

/// How a send ended, from the composer's side.
enum SendOutcome: Equatable {
    case sent(chatID: String?)
    /// It did not reach Server; the viewer's row stays, marked failed, to retry.
    case failed
    /// Nothing left the composer (no Server, nothing to send).
    case rejected
}

/// Where an optimistic row is addressed, so Try Again replays the same send.
enum PendingSendTarget: Equatable, Sendable {
    case chat(chatID: String, replyToMessageID: String?)
    /// A message to a Captain whose chat the Chat list does not hold yet; the
    /// Server resolves the Captain's one chat.
    case captain(agentID: String)
}

/// Delivery of an optimistic row, and the iMessage-style handling of one that
/// failed: it stays in the transcript, marked, until the viewer retries or
/// deletes it. Failed rows are app-local and never patch durable history.
extension HausStore {
    /// Sends `row` to Server. The row is already in the transcript.
    func deliver(_ row: PendingChatMessage) async -> SendOutcome {
        guard let serverID = activeServer?.id else {
            failSend(nonce: row.nonce, reason: "no active Server")
            return .failed
        }
        guard case .chat(let chatID, let replyToMessageID) = row.target else {
            return await deliverCaptainChat(row, serverID: serverID)
        }
        do {
            let uploadedAttachments = try await uploadAttachments(
                row.attachments,
                serverID: serverID,
                chatID: chatID
            )
            // Server deduplicates by nonce, so a send that hit a bad link is
            // replayed before the row is marked failed.
            let client = self.client
            let input = ChatSendInput(
                serverId: serverID,
                chatId: chatID,
                content: row.content,
                nonce: row.nonce,
                attachmentIds: uploadedAttachments.map(\.id),
                replyToMessageId: replyToMessageID
            )
            let receipt: SendReceipt = try await IdempotentRetry.run {
                try await client.mutation("chat.send", input: input)
            }
            row.attachments.forEach(ComposerAttachmentStager.remove)
            // Server has named the message, so the optimistic row can carry the
            // canonical id before its page is refetched.
            adoptSentMessageID(receipt.message.id, nonce: row.nonce, in: receipt.message.chatID)
            await loadMessages(chatID: receipt.message.chatID)
            await markChatReadIfNeeded(chatID: receipt.message.chatID)
            // The receipt is the durable acknowledgement. A projection refresh
            // racing the event stream must not turn it back into a failure.
            try? await reloadChats(serverID: serverID)
            return .sent(chatID: nil)
        } catch {
            failSend(nonce: row.nonce, reason: error.localizedDescription)
            return .failed
        }
    }

    /// Try Again on a failed row: the same content, target, and nonce, so a
    /// send that did reach Server replays instead of posting twice.
    func retryFailedSend(messageID: String) async {
        guard let nonce = pendingNonce(messageID: messageID),
              let retry = OptimisticMessageRow.beginRetry(nonce: nonce, in: &pendingMessagesByChatID)
        else { return }
        _ = await deliver(retry.row)
    }

    /// Delete on a failed row removes it and its staged files.
    func deleteFailedSend(messageID: String) {
        guard let nonce = pendingNonce(messageID: messageID),
              let row = OptimisticMessageRow.removeFailed(nonce: nonce, in: &pendingMessagesByChatID)
        else { return }
        row.attachments.forEach(ComposerAttachmentStager.remove)
    }

    func failSend(nonce: String, reason: String) {
        Self.logger.error("Sending a message failed: \(reason, privacy: .public)")
        guard OptimisticMessageRow.markFailed(nonce: nonce, in: &pendingMessagesByChatID) else { return }
        #if canImport(UIKit)
        UINotificationFeedbackGenerator().notificationOccurred(.error)
        #endif
    }

    private func pendingNonce(messageID: String) -> String? {
        pendingMessagesByChatID.values.lazy.flatMap { $0 }.first { $0.id == messageID }?.nonce
    }
}
