import SwiftUI
#if os(iOS)
import UIKit
#endif

extension MessageComposerView {
    /// Clears the composer at once and hands the words to `onSend`. A send that
    /// never left brings the draft and its attachments back.
    func submit() {
        let content = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let submittedAttachments = interaction.attachments
        guard !content.isEmpty || !submittedAttachments.isEmpty else { return }

        text = ""
        draftFitsOneLine = true
        interaction.attachments = []
        interaction.errorMessage = nil
        sendFeedback += 1
        Task {
            if await onSend(content, submittedAttachments) { return }
            text = text.isEmpty ? content : [content, text].filter { !$0.isEmpty }.joined(separator: "\n")
            interaction.attachments = submittedAttachments + interaction.attachments
            sendFailureFeedback += 1
        }
    }

    func announceAccessibility(_ message: String) {
        #if os(iOS)
        UIAccessibility.post(notification: .announcement, argument: message)
        #endif
    }
}
