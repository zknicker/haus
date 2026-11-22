import SwiftUI

public struct ChatScreenView: View {
    let chat: ChatDestination
    private let messages: [MessagePresentation]
    private let isMessageHistoryLoaded: Bool
    private let isConnected: Bool
    private let onOpenSidebar: () -> Void
    /// The back circle's action. Until a navigation stack hosts the screen it falls back to the
    /// sidebar, which is where back leads today.
    private let onBack: (() -> Void)?
    private let onOpenChatDetails: () -> Void
    private let onOpenSearch: () -> Void
    private let onSend: (String, [ComposerAttachment]) async -> Bool
    private let onSendInlineReply:
        ((String, [ComposerAttachment], MessageReplyReferencePresentation) async -> Bool)?
    private let onOpenAttachment: (MessageAttachmentPresentation) async throws -> URL
    private let onOpenAgent: (String) -> Void
    private let onCall: (() -> Void)?
    /// Place-specific actions for the header's `…` menu, such as Stop on a Captain DM.
    private let menuActions: [ChatHeaderMenuAction]
    private let history: MessageHistoryNavigation
    let mentionOptions: [MentionOptionPresentation]
    private let onLoadMentionOptions: () async -> Void
    let contentInsets: EdgeInsets
    /// The message ids this Chat's transcript is showing. The App turns them
    /// into the read acknowledgement; the screen only forwards them.
    private let onVisibleMessagesChange: ([String]) -> Void

    @Binding private var scrollTargetMessageID: String?
    /// The draft is owned above this screen, which is remounted per Chat, so a
    /// half-typed message survives a switch away and back.
    @Binding var draft: String
    /// Owned above this screen for the same reason the draft is: staged
    /// attachments belong to the Chat, not to the screen drawing it.
    let composerInteraction: ComposerInteraction
    @FocusState var isComposerFocused: Bool
    @Namespace var composerTransitionNamespace
    @State var inlineReply: MessageReplyReferencePresentation?
    /// The keyboard's reach from the screen bottom, read from UIKit (`onKeyboardInsetChange`);
    /// nil until the first reading, when the shell's home-indicator inset stands in.
    @State var keyboardInset: CGFloat?
    /// Turn details asked for by a message's "View turn details"; the header presents it.
    @State private var turnDetailsFocus: TurnDetailsFocus?
    @State var pendingModelChange: PendingModelChange?
    /// Set once the Server refuses a model change; the inner nil is a refusal with no reason.
    @State var modelRefusal: String??
    @State var modelChangeError: String?
    @Environment(\.hausDrawerEngaged) private var isDrawerEngaged
    @Environment(\.chatEngagementSource) var engagementSource

    public init(
        chat: ChatDestination,
        messages: [MessagePresentation],
        isMessageHistoryLoaded: Bool = true,
        draft: Binding<String>,
        composerInteraction: ComposerInteraction,
        isConnected: Bool,
        onOpenSidebar: @escaping () -> Void,
        onBack: (() -> Void)? = nil,
        onOpenChatDetails: @escaping () -> Void,
        onOpenSearch: @escaping () -> Void,
        onSend: @escaping (String, [ComposerAttachment]) async -> Bool,
        onSendInlineReply: ((String, [ComposerAttachment], MessageReplyReferencePresentation) async -> Bool)? = nil,
        onOpenAttachment: @escaping (MessageAttachmentPresentation) async throws -> URL = { attachment in
            guard let localURL = attachment.localURL else { throw CancellationError() }
            return localURL
        },
        onOpenAgent: @escaping (String) -> Void = { _ in },
        onCall: (() -> Void)? = nil,
        menuActions: [ChatHeaderMenuAction] = [],
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
        self.onBack = onBack
        self.onOpenChatDetails = onOpenChatDetails
        self.onOpenSearch = onOpenSearch
        self.onSend = onSend
        self.onSendInlineReply = onSendInlineReply
        self.onOpenAttachment = onOpenAttachment
        self.onOpenAgent = onOpenAgent
        self.onCall = onCall
        self.menuActions = menuActions
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
            // The header floats over the transcript rather than capping it, so glass has live
            // content to refract behind it. It is a `chromeBar` and not a plain inset because the
            // soft edge below only paints behind a declared bar.
            .chromeBar(edge: .top, spacing: 0) {
                ChatScreenHeader(
                    chat: chat,
                    isConnected: isConnected,
                    onBack: onBack ?? onOpenSidebar,
                    onOpenChatDetails: onOpenChatDetails,
                    onOpenSearch: onOpenSearch,
                    onCall: onCall,
                    menuActions: menuActions,
                    turnDetails: $turnDetailsFocus
                )
                .padding(.top, contentInsets.top)
                .openingEntrance(.header)
            }
            // The composer floats over the transcript rather than capping it; the inset reserves
            // the transcript's scroll clearance (see `composer`).
            .safeAreaInset(edge: .bottom, spacing: 0) { composer }
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
            .onChange(of: isDrawerEngaged) { _, engaged in
                if engaged { isComposerFocused = false }
            }
            .modelChangeConfirmation($pendingModelChange, onConfirm: applyModelChange)
            .modelChangeFailure($modelChangeError)
            .background(.background)
            .task(id: chat.id) { await onLoadMentionOptions() }
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
            style: chat.kind.transcriptStyle,
            onContentTap: { isComposerFocused = false },
            allowsInlineReplies: chat.durableChat != nil && onSendInlineReply != nil,
            onSelectInlineReply: selectInlineReply,
            onOpenAttachment: onOpenAttachment,
            onOpenAgent: onOpenAgent,
            onViewTurnDetails: turnDetailsAction,
            history: history,
            scrollTargetMessageID: $scrollTargetMessageID,
            onVisibleMessagesChange: onVisibleMessagesChange
        )
    }

    /// "View turn details" on a Captain's message, where the App gave turn details a source.
    private var turnDetailsAction: ((MessagePresentation) -> Void)? {
        guard chat.durableChat != nil, engagementSource?.turnDetails != nil else { return nil }
        return { message in
            turnDetailsFocus = TurnDetailsFocus(agentIDs: [message.author.id], messageDate: message.createdAt)
        }
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

    func sendMessage(
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
