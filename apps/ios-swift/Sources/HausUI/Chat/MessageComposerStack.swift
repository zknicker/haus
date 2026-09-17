import SwiftUI

/// The shared vertical composer stack. Keeping the inline reference beside the
/// mention picker and surface preserves their single layout animation while
/// keeping `MessageComposerView` focused on input and attachment behavior.
struct MessageComposerStack<Status: View, Surface: View>: View {
    @Binding var text: String
    let mentionOptions: [MentionOptionPresentation]
    let inlineReply: MessageReplyReferencePresentation?
    let onCancelInlineReply: () -> Void
    private let status: () -> Status
    private let surface: () -> Surface

    init(
        text: Binding<String>,
        mentionOptions: [MentionOptionPresentation],
        inlineReply: MessageReplyReferencePresentation?,
        onCancelInlineReply: @escaping () -> Void,
        @ViewBuilder status: @escaping () -> Status,
        @ViewBuilder surface: @escaping () -> Surface
    ) {
        _text = text
        self.mentionOptions = mentionOptions
        self.inlineReply = inlineReply
        self.onCancelInlineReply = onCancelInlineReply
        self.status = status
        self.surface = surface
    }

    var body: some View {
        let isMentionPickerActive = MessageComposerMentionPicker.isActive(
            text: text,
            options: mentionOptions
        )
        return VStack(alignment: .leading, spacing: 8) {
            status()
            MessageComposerMentionPicker(text: $text, options: mentionOptions)
            if let inlineReply {
                InlineReplyComposerReference(
                    reference: inlineReply,
                    onCancel: onCancelInlineReply
                )
            }
            surface()
        }
        // Keyed on the card's presence, never on its contents: filtering reflows the rows without
        // replaying the entrance, and the stack still animates the height the card takes so the
        // input rides up rather than jumping.
        .animation(
            isMentionPickerActive ? MentionPickerMotion.arrive : MentionPickerMotion.leave,
            value: isMentionPickerActive
        )
    }
}
