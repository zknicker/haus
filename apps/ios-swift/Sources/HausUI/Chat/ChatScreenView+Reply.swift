import SwiftUI

/// An inline reply and a Task's chip never share the composer (specs/ios-app.md,
/// Task mode): choosing Reply lets go of the chip, so the reply goes to the
/// conversation, and aiming the composer at a Task drops the reply.
extension ChatScreenView {
    func selectInlineReply(_ message: MessagePresentation) {
        guard chat.durableChat != nil, !message.isPending else { return }
        if composerTask != nil { onClearComposerTask() }
        inlineReply = MessageReplyReferencePresentation(
            id: message.id,
            author: message.author,
            content: message.content,
            createdAt: message.createdAt,
            sequence: message.sequence
        )
        isComposerFocused = true
    }

    /// The reply the composer shows and sends with.
    var composerInlineReply: MessageReplyReferencePresentation? {
        ComposerReplyRule.reply(inlineReply, beside: composerTask)
    }

    func dropsReplyWhenAimed(_ isAimed: Bool) {
        if isAimed { inlineReply = nil }
    }

    func sendMessage(
        _ content: String,
        _ attachments: [ComposerAttachment]
    ) async -> Bool {
        guard let inlineReply = composerInlineReply else {
            return await onSend(content, attachments)
        }

        guard let onSendInlineReply else { return false }
        // The reply lands in the transcript the moment it is sent, so the
        // composer lets go of its target with the draft rather than holding it
        // until Server answers. Only a send that never left brings it back.
        self.inlineReply = nil
        let sent = await onSendInlineReply(content, attachments, inlineReply)
        if !sent, self.inlineReply == nil {
            self.inlineReply = inlineReply
        }
        return sent
    }
}

enum ComposerReplyRule {
    static func reply<Reply>(_ reply: Reply?, beside taskChip: ComposerTaskChip?) -> Reply? {
        taskChip == nil ? reply : nil
    }
}
