import SwiftUI

public struct ChatScreenView: View {
    private let chat: ChatDestination
    private let messages: [MessagePresentation]
    private let isMessageHistoryLoaded: Bool
    private let isConnected: Bool
    private let onOpenSidebar: () -> Void
    private let onOpenChatDetails: () -> Void
    private let onOpenSearch: () -> Void
    private let onOpenThread: (MessagePresentation) -> Void
    private let onSend: (String, [ComposerAttachment]) async -> Bool
    private let onSendInlineReply:
        ((String, [ComposerAttachment], MessageReplyReferencePresentation) async -> Bool)?
    private let onOpenAttachment: (MessageAttachmentPresentation) async throws -> URL
    private let onOpenAgent: (String) -> Void
    private let hasOlderMessages: Bool
    private let isLoadingOlderMessages: Bool
    private let onLoadOlderMessages: () async -> Bool
    private let mentionOptions: [MentionOptionPresentation]
    private let onLoadMentionOptions: () async -> Void
    private let contentInsets: EdgeInsets
    /// The message ids this Chat's transcript is showing. The App turns them
    /// into the read acknowledgement; the screen only forwards them.
    private let onVisibleMessagesChange: ([String]) -> Void

    @Binding private var scrollTargetMessageID: String?
    /// The draft is owned above this screen, which is remounted per Chat, so a
    /// half-typed message survives a switch away and back.
    @Binding private var draft: String
    /// Owned above this screen for the same reason the draft is: staged
    /// attachments belong to the Chat, not to the screen drawing it.
    private let composerInteraction: ComposerInteraction
    @FocusState private var isComposerFocused: Bool
    @Namespace private var composerTransitionNamespace
    @State private var inlineReply: MessageReplyReferencePresentation?

    public init(
        chat: ChatDestination,
        messages: [MessagePresentation],
        isMessageHistoryLoaded: Bool = true,
        draft: Binding<String>,
        composerInteraction: ComposerInteraction,
        isConnected: Bool,
        onOpenSidebar: @escaping () -> Void,
        onOpenChatDetails: @escaping () -> Void,
        onOpenSearch: @escaping () -> Void,
        onOpenThread: @escaping (MessagePresentation) -> Void,
        onSend: @escaping (String, [ComposerAttachment]) async -> Bool,
        onSendInlineReply: ((String, [ComposerAttachment], MessageReplyReferencePresentation) async -> Bool)? = nil,
        onOpenAttachment: @escaping (MessageAttachmentPresentation) async throws -> URL = { attachment in
            guard let localURL = attachment.localURL else { throw CancellationError() }
            return localURL
        },
        onOpenAgent: @escaping (String) -> Void = { _ in },
        hasOlderMessages: Bool = false,
        isLoadingOlderMessages: Bool = false,
        onLoadOlderMessages: @escaping () async -> Bool = { false },
        mentionOptions: [MentionOptionPresentation] = [],
        onLoadMentionOptions: @escaping () async -> Void = {},
        contentInsets: EdgeInsets = EdgeInsets(),
        scrollTargetMessageID: Binding<String?> = .constant(nil),
        onVisibleMessagesChange: @escaping ([String]) -> Void = { _ in }
    ) {
        _scrollTargetMessageID = scrollTargetMessageID
        _draft = draft
        self.onVisibleMessagesChange = onVisibleMessagesChange
        self.composerInteraction = composerInteraction
        self.chat = chat
        self.messages = messages
        self.isMessageHistoryLoaded = isMessageHistoryLoaded
        self.isConnected = isConnected
        self.onOpenSidebar = onOpenSidebar
        self.onOpenChatDetails = onOpenChatDetails
        self.onOpenSearch = onOpenSearch
        self.onOpenThread = onOpenThread
        self.onSend = onSend
        self.onSendInlineReply = onSendInlineReply
        self.onOpenAttachment = onOpenAttachment
        self.onOpenAgent = onOpenAgent
        self.hasOlderMessages = hasOlderMessages
        self.isLoadingOlderMessages = isLoadingOlderMessages
        self.onLoadOlderMessages = onLoadOlderMessages
        self.mentionOptions = mentionOptions
        self.onLoadMentionOptions = onLoadMentionOptions
        self.contentInsets = contentInsets
    }

    public var body: some View {
        // The timeline's opening settle runs inside its own table (see
        // `TranscriptListView.animatesEntrance`); the header and composer
        // stay on the SwiftUI modifier.
        timeline
            // The header floats over the transcript rather than capping it, so glass has
            // live content to refract behind it. The shell ignores safe areas on this
            // canvas, so the status-bar clearance that used to sit on the outer VStack
            // moves onto the header itself, inside the bar. It is a `chromeBar` and not a
            // plain inset because the soft edge below only paints behind a declared bar.
            .chromeBar(edge: .top, spacing: 0) {
                header
                    .padding(.top, contentInsets.top)
                    .openingEntrance(.header)
            }
            // The composer floats over the transcript rather than capping it, so glass has
            // live content to refract. The inset still reserves the same scroll clearance
            // the old opaque band did. This end stays a plain inset: the clearance it
            // reserves is the transcript's own scroll bound, so a resting or dragged
            // transcript never puts a sharp row below the composer, and the only rows that
            // reach it are the ones its glass is already refracting.
            .safeAreaInset(edge: .bottom, spacing: 0) {
                MessageComposerView(
                    text: $draft,
                    interaction: composerInteraction,
                    placeholder: "Message \(chat.kind.isChannel ? "#" : "")\(chat.title)",
                    isConnected: isConnected,
                    isTextFocused: $isComposerFocused,
                    allowsAttachments: chat.durableChat != nil,
                    mentionOptions: mentionOptions,
                    inlineReply: inlineReply,
                    onCancelInlineReply: { inlineReply = nil },
                    transitionNamespace: composerTransitionNamespace,
                    onSend: sendMessage
                )
                .padding(.bottom, chatBottomInset)
                // The shell ignores the keyboard safe area, so this manual inset is the only
                // keyboard response the canvas has — and it arrives as plain data through a
                // GeometryReader, outside the keyboard's own animation transaction. Without
                // this, the transcript and composer teleport to the keyboard-up layout while
                // the keyboard is still sliding in below them.
                .animation(ComposerKeyboardMotion.travel, value: chatBottomInset)
                .openingEntrance(.composer)
            }
            // The portal is drawn in an overlay window above the keyboard, measured against the
            // display rather than against this screen: the card keeps its full height and its gap
            // from the true screen bottom while the keyboard slides out from behind it.
            .composerAttachmentPortal(
                interaction: composerInteraction,
                transitionNamespace: composerTransitionNamespace
            )
            .composerPortalFreeze(
                interaction: composerInteraction,
                isTextFocused: $isComposerFocused,
                liveBottomInset: contentInsets.bottom
            )
            .background(.background)
            .task(id: chat.id) { await onLoadMentionOptions() }
    }

    /// The keyboard reaches this screen as a bottom safe-area inset from the shell. Freezing that
    /// one number is what keeps the transcript and the composer pixel-static across the keyboard
    /// leaving and returning behind an open portal: it sets how far the composer sits off the
    /// screen bottom, and through the composer's own height it sets the transcript's clearance.
    private var chatBottomInset: CGFloat {
        composerInteraction.portalFreeze.bottomInset(live: contentInsets.bottom)
    }

    /// A caller's safe-area attachment lands on the timeline's transcript root, so the
    /// transcript scrolls beneath both the header and the composer instead of clipping under
    /// them. The soft top edge is set by the transcript's own table (see
    /// `TranscriptListView`); `chromeBar` in `body` is what gives it a region to paint.
    private var timeline: some View {
        MessageTimelineView(
            messages: messages,
            isMessageHistoryLoaded: isMessageHistoryLoaded,
            emptyStateDescription: emptyStateDescription,
            onOpenThread: onOpenThread,
            allowsInlineReplies: chat.durableChat != nil && onSendInlineReply != nil,
            onSelectInlineReply: selectInlineReply,
            onOpenAttachment: onOpenAttachment,
            onOpenAgent: onOpenAgent,
            hasOlderMessages: hasOlderMessages,
            isLoadingOlderMessages: isLoadingOlderMessages,
            onLoadOlderMessages: onLoadOlderMessages,
            scrollTargetMessageID: $scrollTargetMessageID,
            onVisibleMessagesChange: onVisibleMessagesChange
        )
    }

    private var emptyStateDescription: String {
        if chat.kind.isChannel {
            "Start the conversation in #\(chat.title)."
        } else {
            "Send the first message to \(chat.title)."
        }
    }

    private func selectInlineReply(_ message: MessagePresentation) {
        guard chat.durableChat != nil, !message.isPending else { return }
        inlineReply = MessageReplyReferencePresentation(
            id: message.id,
            author: message.author,
            content: message.content,
            createdAt: message.createdAt,
            sequence: message.sequence
        )
        isComposerFocused = true
    }

    private func sendMessage(
        _ content: String,
        _ attachments: [ComposerAttachment]
    ) async -> Bool {
        guard let inlineReply else {
            return await onSend(content, attachments)
        }

        guard let onSendInlineReply else { return false }
        let sent = await onSendInlineReply(content, attachments, inlineReply)
        if sent, self.inlineReply?.id == inlineReply.id {
            self.inlineReply = nil
        }
        return sent
    }

    private var header: some View {
        ChromeHeader {
            GlassChromeButton(.sidebar, label: "Open navigation", action: onOpenSidebar)
        } center: {
            Button(action: onOpenChatDetails) {
                HStack(spacing: 7) {
                    chatIdentity
                    Text(chat.title).font(.headline).lineLimit(1)
                    Image(systemName: "chevron.right")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: 220)
            }
            .buttonStyle(.plain)
        } trailing: {
            GlassChromeButton(.icon(.search), label: "Search messages", action: onOpenSearch)
        }
    }

    @ViewBuilder
    private var chatIdentity: some View {
        switch chat.kind {
        case .channel:
            ChannelIconBox(appearance: chat.appearance, size: 26)
        case .agentDirectMessage(let agent):
            AvatarView(name: agent.name, url: agent.avatarURL, presence: agent.presence, size: 30)
        case .humanDirectMessage(let human):
            AvatarView(name: human.name, url: human.avatarURL, presence: nil, size: 30)
        }
    }

}

private extension ChatKind {
    var isChannel: Bool {
        if case .channel = self { true } else { false }
    }
}

#Preview {
    @Previewable @State var draft = ""
    @Previewable @State var composerInteraction = ComposerInteraction()

    ChatScreenView(
        chat: .durableChat(ChatFixtures.chats[1]),
        messages: ChatFixtures.messages,
        draft: $draft,
        composerInteraction: composerInteraction,
        isConnected: true,
        onOpenSidebar: {},
        onOpenChatDetails: {},
        onOpenSearch: {},
        onOpenThread: { _ in },
        onSend: { _, _ in true }
    )
}

#Preview("Empty Chat") {
    @Previewable @State var draft = ""
    @Previewable @State var composerInteraction = ComposerInteraction()

    ChatScreenView(
        chat: .durableChat(ChatFixtures.chats[1]),
        messages: [],
        draft: $draft,
        composerInteraction: composerInteraction,
        isConnected: true,
        onOpenSidebar: {},
        onOpenChatDetails: {},
        onOpenSearch: {},
        onOpenThread: { _ in },
        onSend: { _, _ in true }
    )
}
