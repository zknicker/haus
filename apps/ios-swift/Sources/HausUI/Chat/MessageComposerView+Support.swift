import SwiftUI

extension MessageComposerView {
    /// A composer whose placeholder follows its place: "Reply" in Captain DMs and Task chats,
    /// "Message #name" in Projects.
    public init(
        text: Binding<String>,
        interaction: ComposerInteraction,
        place: ComposerPlace,
        isTextFocused: FocusState<Bool>.Binding,
        allowsAttachments: Bool = true,
        mentionOptions: [MentionOptionPresentation] = [],
        inlineReply: MessageReplyReferencePresentation? = nil,
        onCancelInlineReply: @escaping () -> Void = {},
        taskChip: ComposerTaskChip? = nil,
        onClearTaskChip: @escaping () -> Void = {},
        transitionNamespace: Namespace.ID? = nil,
        onSend: @escaping (String, [ComposerAttachment]) async -> Bool
    ) {
        self.init(
            text: text,
            interaction: interaction,
            placeholder: place.placeholder,
            isTextFocused: isTextFocused,
            allowsAttachments: allowsAttachments,
            mentionOptions: mentionOptions,
            inlineReply: inlineReply,
            onCancelInlineReply: onCancelInlineReply,
            taskChip: taskChip,
            onClearTaskChip: onClearTaskChip,
            transitionNamespace: transitionNamespace,
            onSend: onSend
        )
    }

    /// The composer stays a one-line pill, focused or not, until the draft needs a second line;
    /// then it grows into the card with its controls row below the text, as ChatGPT's does. A
    /// staged attachment needs the card for its strip. Deliberately blind to the portal: the plus
    /// opens the source menu over whichever shape the composer has.
    static func shouldExpand(
        isFocused: Bool,
        draftFitsOneLine: Bool,
        hasAttachments: Bool,
        isPreparingAttachment: Bool
    ) -> Bool {
        (isFocused && !draftFitsOneLine) || hasAttachments || isPreparingAttachment
    }
}

extension View {
    /// The send control shows only with something to send, as Capy's does. Its slot keeps its
    /// width, so the field does not reflow as the first character lands.
    func composerSendPresence(_ canSend: Bool) -> some View {
        disabled(!canSend)
            .opacity(canSend ? 1 : 0)
            .accessibilityHidden(!canSend)
            .animation(.easeOut(duration: 0.15), value: canSend)
    }

    /// Why a picked file could not join the draft, as a native alert. The
    /// message clears when the alert is dismissed.
    func composerAttachmentAlert(message: Binding<String?>) -> some View {
        alert(
            "Couldn’t Add Attachment",
            isPresented: Binding(
                get: { message.wrappedValue != nil },
                set: { if !$0 { message.wrappedValue = nil } }
            ),
            presenting: message.wrappedValue
        ) { _ in
            Button("OK", role: .cancel) {}
        } message: { text in
            Text(text)
        }
    }
}
