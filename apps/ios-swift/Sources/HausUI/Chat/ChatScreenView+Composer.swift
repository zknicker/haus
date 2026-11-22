import SwiftUI

/// The Chat canvas's composer: its place sets the placeholder ("Reply" with a Captain, "Message
/// #name" in a Project), and a Captain DM gets the model chip.
extension ChatScreenView {
    /// The composer floats over the transcript rather than capping it, so glass has live content
    /// to refract. The inset still reserves the transcript's scroll clearance, so a resting or
    /// dragged transcript never puts a sharp row below the composer.
    var composer: some View {
        VStack(spacing: 0) {
            ChatComposerStatus(peerAgentID: chat.kind.peerAgentID)
            MessageComposerView(
                text: $draft,
                interaction: composerInteraction,
                place: chat.kind.composerPlace(title: chat.title),
                isTextFocused: $isComposerFocused,
                allowsAttachments: chat.durableChat != nil,
                mentionOptions: mentionOptions,
                inlineReply: inlineReply,
                onCancelInlineReply: { inlineReply = nil },
                transitionNamespace: composerTransitionNamespace,
                model: composerModel(for: chat.kind),
                onSend: sendMessage
            )
            // The shell ignores the keyboard, so this inset is the canvas's only keyboard
            // response. Each reading arrives in its own transaction: the keyboard's curve
            // for a rise or fall, none while a finger drags the keyboard down.
            .padding(.bottom, chatBottomInset)
            .openingEntrance(.composer)
        }
    }

    /// The keyboard reaches this screen as a bottom safe-area inset from the shell. Freezing that
    /// one number is what keeps the transcript and the composer pixel-static across the keyboard
    /// leaving and returning behind an open portal: it sets how far the composer sits off the
    /// screen bottom, and through the composer's own height it sets the transcript's clearance.
    var chatBottomInset: CGFloat {
        composerInteraction.portalFreeze.bottomInset(live: liveBottomInset)
    }

    var liveBottomInset: CGFloat { keyboardInset ?? contentInsets.bottom }
}

extension ChatKind {
    /// An Agent DM's peer, whose stopped notice sits over the composer.
    public var peerAgentID: String? {
        if case .agentDirectMessage(let agent) = self { agent.id } else { nil }
    }

    var isChannel: Bool {
        if case .channel = self { true } else { false }
    }

    /// A Captain DM reads as the assistant layout; Projects, `#all`, and DMs with people keep
    /// roster rows (`specs/ios-app.md`, "Places and transcripts").
    var transcriptStyle: TranscriptStyle {
        if case .agentDirectMessage = self { .assistant } else { .roster }
    }

    /// An Agent DM's title already shows its Agent, so its pill is the thought.
    var engagementStyle: HeaderEngagementStyle {
        if case .agentDirectMessage = self { .subtitle } else { .roster }
    }

    func composerPlace(title: String) -> ComposerPlace {
        switch self {
        case .channel: .project(name: title)
        case .agentDirectMessage: .captain
        case .humanDirectMessage: .person(name: title)
        }
    }
}
