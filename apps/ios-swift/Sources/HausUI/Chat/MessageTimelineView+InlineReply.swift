import SwiftUI

extension MessageTimelineView {
    var inlineReplyErrorPresented: Binding<Bool> {
        Binding(
            get: { inlineReplyError != nil },
            set: { isPresented in
                if !isPresented {
                    inlineReplyError = nil
                }
            }
        )
    }

    func revealScrollTarget() {
        guard let scrollTargetMessageID else { return }
        cancelPendingInlineReply()

        switch MessageTimelineScrollTarget.resolve(
            target: scrollTargetMessageID,
            messageIDs: messages.map(\.id)
        ) {
        case .waiting:
            return
        case .unavailable:
            // Search targets are owned by the shell and do not auto-page. Inline
            // reply targets use their own loader below, so they never reach here.
            self.scrollTargetMessageID = nil
        case .reveal(let messageID):
            self.scrollTargetMessageID = nil
            reveal = TranscriptReveal(token: UUID(), id: messageID, animated: true)
            highlightedMessageID = messageID
        }
    }

    func requestInlineReply(_ reference: MessageReplyReferencePresentation) {
        inlineReplyError = nil
        pendingInlineReply = reference
        inlineReplyRevealAttempt += 1
    }

    func cancelPendingInlineReply() {
        guard pendingInlineReply != nil || inlineReplyError != nil else { return }
        pendingInlineReply = nil
        inlineReplyError = nil
        inlineReplyRevealAttempt += 1
    }

    func advanceInlineReplyReveal() {
        guard pendingInlineReply != nil else { return }
        inlineReplyRevealAttempt += 1
    }

    func resolvePendingInlineReply() async {
        guard let target = pendingInlineReply else { return }
        // The initial Chat page may still be on its way. Keep the request alive
        // until that page arrives instead of reporting an older-history miss.
        guard !messages.isEmpty || isMessageHistoryLoaded else { return }

        if messages.contains(where: { $0.id == target.id }) {
            revealInlineReply(target.id)
            return
        }

        guard MessageTimelineScrollTarget.shouldLoadOlder(
            targetSequence: target.sequence,
            loadedMessageSequences: messages.compactMap(\.sequence),
            hasOlderMessages: hasOlderMessages
        ) else {
            failInlineReply(
                targetID: target.id,
                message: "The parent message is no longer available in this chat."
            )
            return
        }

        guard let onLoadOlderMessages else {
            failInlineReply(
                targetID: target.id,
                message: "Older messages are unavailable for this chat."
            )
            return
        }

        if isLoadingOlderMessages {
            await retryInlineReplyReveal(targetID: target.id)
            return
        }

        guard await onLoadOlderMessages() else {
            guard !Task.isCancelled else { return }
            failInlineReply(
                targetID: target.id,
                message: "Older messages could not be loaded. Try again."
            )
            return
        }
        guard !Task.isCancelled, pendingInlineReply?.id == target.id else { return }
        // The loader updates the message source before returning. Bump
        // the task identity so the next attempt reads that refreshed page even
        // when its id list did not change.
        inlineReplyRevealAttempt += 1
    }

    func retryInlineReplyReveal(targetID: String) async {
        do {
            try await Task.sleep(for: .milliseconds(150))
        } catch {
            return
        }
        guard !Task.isCancelled, pendingInlineReply?.id == targetID else { return }
        inlineReplyRevealAttempt += 1
    }

    func revealInlineReply(_ messageID: String) {
        guard pendingInlineReply?.id == messageID else { return }
        pendingInlineReply = nil
        reveal = TranscriptReveal(token: UUID(), id: messageID, animated: true)
        highlightedMessageID = messageID
    }

    func failInlineReply(targetID: String, message: String) {
        guard pendingInlineReply?.id == targetID else { return }
        inlineReplyError = message
    }
}
