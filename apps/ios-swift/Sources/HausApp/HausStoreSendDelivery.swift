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
    /// Server accepted it. A Thread reply names the child Chat it landed in,
    /// and a first Agent message the DM Server materialized.
    case sent(chatID: String?)
    /// It did not reach Server; the viewer's row stays, marked failed, to retry.
    case failed
    /// Nothing left the composer (no Server, nothing to send).
    case rejected
}

/// Where an optimistic row is addressed, so Try Again replays the same send.
enum PendingSendTarget: Equatable, Sendable {
    case chat(chatID: String, replyToMessageID: String?, threadAnchorMessageID: String?)
    /// A first message to an Agent, which Server materializes the DM for.
    case agentDM(agentID: String)
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
        guard case .chat(let chatID, let replyToMessageID, let threadAnchorMessageID) = row.target else {
            return await deliverAgentDM(row, serverID: serverID)
        }
        do {
            // Attachments are reserved in the Chat the composer is anchored in,
            // which for a Thread reply is the parent Chat — a first reply has no
            // Thread chat id yet. Server re-homes them to the Thread the reply
            // lands in, exactly as it does for the web composer.
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
                replyToMessageId: replyToMessageID,
                thread: threadAnchorMessageID.map(ChatThreadInput.init(anchorMessageId:))
            )
            let receipt: SendReceipt = try await IdempotentRetry.run {
                try await client.mutation("chat.send", input: input)
            }
            row.attachments.forEach(ComposerAttachmentStager.remove)
            // A first reply is optimistically keyed by its anchor (or another
            // temporary route key). Move it to the child Chat returned by
            // Server before loading that page so reconciliation retires the
            // pending row instead of leaving a duplicate in the transcript.
            adoptPendingMessages(from: row.chatID, to: receipt.message.chatID)
            // Server has named the message, so the optimistic row can carry the
            // canonical id before its page is refetched.
            adoptSentMessageID(receipt.message.id, nonce: row.nonce, in: receipt.message.chatID)
            await loadMessages(chatID: receipt.message.chatID)
            await markChatReadIfNeeded(chatID: receipt.message.chatID)
            if threadAnchorMessageID != nil {
                // Thread sends are addressed to the parent Chat plus anchor. Refresh
                // both pages: the receipt lives in the child Chat while its reply
                // count is projected onto the parent anchor.
                await loadMessages(chatID: chatID)
            }
            // The receipt is the durable acknowledgement. A projection refresh
            // racing the event stream must not turn it back into a failure.
            try? await reloadChats(serverID: serverID)
            return .sent(chatID: receipt.threadChatID)
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
