import SwiftUI

/// The Chat canvas's composer: its place sets the placeholder ("Reply" with a Captain, "Message
/// #name" in a Project).
extension ChatScreenView {
    /// The composer floats over the transcript rather than capping it, so glass has live content
    /// to refract. The inset still reserves the transcript's scroll clearance, so a resting or
    /// dragged transcript never puts a sharp row below the composer.
    var composer: some View {
        VStack(spacing: 0) {
            WorkPillSlot(state: workPill, open: onOpenWork)
            ChatComposerStatus(peerAgentID: chat.kind.peerAgentID)
            MessageComposerView(
                text: $draft,
                interaction: composerInteraction,
                place: composerTask == nil ? chat.kind.composerPlace(title: chat.title) : .steeringTask,
                isTextFocused: $isComposerFocused,
                allowsAttachments: chat.durableChat != nil,
                mentionOptions: mentionOptions,
                inlineReply: composerInlineReply,
                onCancelInlineReply: { inlineReply = nil },
                taskChip: composerTask,
                onClearTaskChip: onClearComposerTask,
                transitionNamespace: composerTransitionNamespace,
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

    var liveBottomInset: CGFloat {
        ChatComposerInset.bottom(keyboard: keyboardInset, screen: contentInsets.bottom)
    }
}

/// How far the Chat composer sits off the screen bottom. The keyboard reader
/// knows the keyboard and the home indicator, but not the system's bars: with
/// bars horizontal at regular width (inner portrait) the tab bar floats at the
/// bottom, inside the screen's own bottom inset, and the composer sat under
/// it. The composer clears whichever reaches higher; the keyboard always
/// covers the tab bar when it is up.
enum ChatComposerInset {
    static func bottom(keyboard: CGFloat?, screen: CGFloat) -> CGFloat {
        max(keyboard ?? 0, screen)
    }
}

extension ChatKind {
    /// An Agent DM's peer, whose stopped notice sits over the composer.
    public var peerAgentID: String? {
        if case .captainChat(let agent) = self { agent.id } else { nil }
    }

    var isChannel: Bool {
        if case .channel = self { true } else { false }
    }

    /// A Captain DM reads as the assistant layout; Projects, `#all`, and DMs with people keep
    /// roster rows (`specs/ios-app.md`, "Places and transcripts").
    var transcriptStyle: TranscriptStyle {
        if case .captainChat = self { .assistant } else { .roster }
    }

    /// An Agent DM's title already shows its Agent, so its pill is the thought.
    var engagementStyle: HeaderEngagementStyle {
        if case .captainChat = self { .subtitle } else { .roster }
    }

    func composerPlace(title: String) -> ComposerPlace {
        switch self {
        case .channel: .project(name: title)
        case .captainChat: .captain
        case .humanDirectMessage: .person(name: title)
        }
    }
}
