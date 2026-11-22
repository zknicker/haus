import SwiftUI

/// The assistant layout's two row shapes: the person's bubble and a Captain's
/// full-width reply.
extension MessageTimelineRow {
    var bubbleRow: some View {
        VStack(alignment: .trailing, spacing: 4) {
            if hasLead {
                TranscriptTrailingColumn { lead }
            }
            if message.prose.isEmpty {
                accessibilityAnchor
            } else {
                TranscriptTrailingColumn {
                    MessageBubble(blocks: message.richBlocks)
                        .messageRowAccessibility(message, actions: accessibilityActions)
                }
            }
            cards(alignment: .trailing)
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
    }

    var proseRow: some View {
        VStack(alignment: .leading, spacing: 4) {
            lead
            if message.prose.isEmpty {
                accessibilityAnchor
            } else {
                prose.messageRowAccessibility(message, actions: accessibilityActions)
            }
            cards(alignment: .leading)
            if !message.isPending, !message.prose.isEmpty {
                MessageCopyButton(message: message)
            }
        }
    }

    /// With no words to carry it, the row's VoiceOver element still needs a
    /// place to live.
    private var accessibilityAnchor: some View {
        Color.clear
            .frame(width: 1, height: 1)
            .messageRowAccessibility(message, actions: accessibilityActions)
    }

    private var hasLead: Bool {
        message.cause != nil || (showsReplyReference && message.inlineReply != nil)
    }
}
