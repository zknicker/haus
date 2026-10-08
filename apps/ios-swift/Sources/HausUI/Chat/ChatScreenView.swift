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
    private let onCall: (() -> Void)?
    private let history: MessageHistoryNavigation
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
    /// The keyboard's reach from the screen bottom, read from UIKit (`onKeyboardInsetChange`);
    /// nil until the first reading, when the shell's home-indicator inset stands in.
    @State private var keyboardInset: CGFloat?
    @Environment(\.hausDrawerEngaged) private var isDrawerEngaged

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
        onCall: (() -> Void)? = nil,
        history: MessageHistoryNavigation = .init(),
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
        self.onCall = onCall
        self.history = history
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
                ChatScreenHeader(
                    chat: chat,
                    isConnected: isConnected,
                    onOpenSidebar: onOpenSidebar,
                    onOpenChatDetails: onOpenChatDetails,
                    onOpenSearch: onOpenSearch,
                    onCall: onCall
                )
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
                VStack(spacing: 0) {
                    ChatComposerStatus(peerAgentID: chat.kind.peerAgentID)
                    MessageComposerView(
                        text: $draft,
                        interaction: composerInteraction,
                        placeholder: "Message \(chat.kind.isChannel ? "#" : "")\(chat.title)",
                        isTextFocused: $isComposerFocused,
                        allowsAttachments: chat.durableChat != nil,
                        mentionOptions: mentionOptions,
                        inlineReply: inlineReply,
                        onCancelInlineReply: { inlineReply = nil },
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
                liveBottomInset: liveBottomInset
            )
            .onKeyboardInsetChange { sample in
                withTransaction(Transaction(animation: sample.animation)) {
                    keyboardInset = sample.inset
                }
            }
            // The keyboard leaves before anything covers the composer — the drawer, a pushed
            // Thread — and nothing raises it again when that surface goes away.
            .onChange(of: isDrawerEngaged) { _, engaged in
                if engaged { isComposerFocused = false }
            }
            .background(.background)
            .task(id: chat.id) { await onLoadMentionOptions() }
    }

    /// The keyboard reaches this screen as a bottom safe-area inset from the shell. Freezing that
    /// one number is what keeps the transcript and the composer pixel-static across the keyboard
    /// leaving and returning behind an open portal: it sets how far the composer sits off the
    /// screen bottom, and through the composer's own height it sets the transcript's clearance.
    private var chatBottomInset: CGFloat {
        composerInteraction.portalFreeze.bottomInset(live: liveBottomInset)
    }

    private var liveBottomInset: CGFloat { keyboardInset ?? contentInsets.bottom }

    /// A caller's safe-area attachment lands on the timeline's transcript root, so the
    /// transcript scrolls beneath both the header and the composer instead of clipping under
    /// them. The soft top edge is set by the transcript's own table (see
    /// `TranscriptListView`); `chromeBar` in `body` is what gives it a region to paint.
    private var timeline: some View {
        MessageTimelineView(
            messages: messages,
            isMessageHistoryLoaded: isMessageHistoryLoaded,
            emptyStateDescription: emptyStateDescription,
            onOpenThread: { message in
                isComposerFocused = false
                onOpenThread(message)
            },
            onContentTap: { isComposerFocused = false },
            allowsInlineReplies: chat.durableChat != nil && onSendInlineReply != nil,
            onSelectInlineReply: selectInlineReply,
            onOpenAttachment: onOpenAttachment,
            onOpenAgent: onOpenAgent,
            history: history,
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

extension ChatKind {
    var peerAgentID: String? {
        if case .agentDirectMessage(let agent) = self { agent.id } else { nil }
    }

    var isChannel: Bool {
        if case .channel = self { true } else { false }
    }

    /// An Agent DM's title already shows its Agent, so its row is the thought.
    var engagementStyle: HeaderEngagementStyle {
        if case .agentDirectMessage = self { .subtitle } else { .roster }
    }
}
