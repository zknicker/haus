import SwiftUI

/// A native NavigationStack destination for one message thread.
///
/// The parent chat owns fetching and mutation. This view only presents the
/// anchor, task metadata, current reply state, and local pending state.
public struct ThreadDetailView: View {
    private let anchor: MessagePresentation
    private let replyProvider: () -> [MessagePresentation]
    let pending: Bool
    private let isConnected: Bool
    /// Whether this conversation refuses new Messages — an archived Chat, or a
    /// DM whose peer Agent was retired (`ChatSummary.isReadOnly`). The Thread
    /// keeps its transcript and loses its composer, and with it every Ask
    /// answer control, because no reply can be sent to settle one.
    private let isReadOnly: Bool
    let onSend: (String, [ComposerAttachment]) async -> Bool
    let onOpenAttachment: (MessageAttachmentPresentation) async throws -> URL
    let history: MessageHistoryNavigation
    let inlineReplies: ThreadInlineReplies?
    let onOpenAgent: (String) -> Void
    let onCancelCloudAgent: ((String) async throws -> Void)?
    /// Nil until Server has a Thread row to follow.
    private let follow: ThreadFollow?
    /// The reply ids the transcript is showing. Read acknowledgement is built
    /// on this; the anchor and task rows carry no Server sequence, so the App
    /// simply cannot resolve them.
    private let onVisibleMessagesChange: ([String]) -> Void

    @State private var draft = ""
    @State private var isNearNewest = true
    @State private var reveal: TranscriptReveal?
    /// Same ownership rule as the Chat timeline: the screen presents, the rows
    /// only ask.
    @State var attachmentPreview: AttachmentPreview?
    @State var attachmentTiles = AttachmentImageTileRegistry()
    /// Visual heights are the screen's for the same structural reason attachment
    /// tiles are; see `VisualHeightRegistry`.
    @State var visualHeights = VisualHeightRegistry()
    /// A Thread is one pushed screen rather than a keyed canvas, so its composer
    /// state is screen-owned: it survives anything presented over the Thread and
    /// goes away with the pop, unlike the Chat canvas, whose interactions the
    /// shell keeps per destination.
    @State private var composerInteraction = ComposerInteraction()
    @FocusState private var isComposerFocused: Bool
    @Namespace private var composerTransitionNamespace

    public init(
        anchor: MessagePresentation,
        replies: [MessagePresentation],
        pending: Bool = false,
        isConnected: Bool = true,
        isReadOnly: Bool = false,
        onSend: @escaping (String, [ComposerAttachment]) async -> Bool,
        onOpenAttachment: @escaping (MessageAttachmentPresentation) async throws -> URL = { attachment in
            guard let localURL = attachment.localURL else { throw CancellationError() }
            return localURL
        },
        history: MessageHistoryNavigation = .init(),
        inlineReplies: ThreadInlineReplies? = nil,
        onOpenAgent: @escaping (String) -> Void = { _ in },
        onCancelCloudAgent: ((String) async throws -> Void)? = nil,
        follow: ThreadFollow? = nil,
        onVisibleMessagesChange: @escaping ([String]) -> Void = { _ in }
    ) {
        self.anchor = anchor
        self.replyProvider = { replies }
        self.pending = pending
        self.isConnected = isConnected
        self.isReadOnly = isReadOnly
        self.onSend = onSend
        self.onOpenAttachment = onOpenAttachment
        self.history = history
        self.inlineReplies = inlineReplies
        self.onOpenAgent = onOpenAgent
        self.onCancelCloudAgent = onCancelCloudAgent
        self.follow = follow
        self.onVisibleMessagesChange = onVisibleMessagesChange
    }

    /// Resolves replies while this view's body is being evaluated so an
    /// observation-backed store can invalidate the thread after its first
    /// network load.
    public init(
        anchor: MessagePresentation,
        replies: @escaping () -> [MessagePresentation],
        pending: Bool = false,
        isConnected: Bool = true,
        isReadOnly: Bool = false,
        onSend: @escaping (String, [ComposerAttachment]) async -> Bool,
        onOpenAttachment: @escaping (MessageAttachmentPresentation) async throws -> URL = { attachment in
            guard let localURL = attachment.localURL else { throw CancellationError() }
            return localURL
        },
        history: MessageHistoryNavigation = .init(),
        inlineReplies: ThreadInlineReplies? = nil,
        onOpenAgent: @escaping (String) -> Void = { _ in },
        onCancelCloudAgent: ((String) async throws -> Void)? = nil,
        follow: ThreadFollow? = nil,
        onVisibleMessagesChange: @escaping ([String]) -> Void = { _ in }
    ) {
        self.anchor = anchor
        self.replyProvider = replies
        self.pending = pending
        self.isConnected = isConnected
        self.isReadOnly = isReadOnly
        self.onSend = onSend
        self.onOpenAttachment = onOpenAttachment
        self.history = history
        self.inlineReplies = inlineReplies
        self.onOpenAgent = onOpenAgent
        self.onCancelCloudAgent = onCancelCloudAgent
        self.follow = follow
        self.onVisibleMessagesChange = onVisibleMessagesChange
    }

    public var body: some View {
        let replies = replyProvider()
        let inlineReplyMessages = inlineReplies?.messages() ?? []
        let items = ThreadTranscriptItem.items(
            anchor: anchor,
            replies: replies,
            pending: pending,
            includesInlineReplies: inlineReplies != nil,
            inlineReplies: inlineReplyMessages
        )
        // The Ask a reply here would settle, read in the screen's body so an
        // Ask posted as a reply takes over the moment its Message lands.
        let answerableAskMessageID = ThreadAskAnswerability
            .answerableMessageID(rows: [anchor] + replies, readOnly: isReadOnly)
        // Read here, in the screen's own body, so a visual's height report
        // re-renders the screen and the table re-hosts its visible rows. Read
        // only inside a row it would land on the cell's hosting view, which the
        // table never asks about.
        _ = visualHeights.revision

        return GeometryReader { geometry in
            ZStack(alignment: .bottomLeading) {
                transcript(items: items, answerableAskMessageID: answerableAskMessageID)
                    // Same shape as the chat screen: replies run under the floating glass
                    // composer and the inset reserves their clearance.
                    .safeAreaInset(edge: .bottom, spacing: 0) {
                        if isReadOnly {
                            ThreadReadOnlyNotice()
                        } else {
                            MessageComposerView(
                                text: $draft,
                                interaction: composerInteraction,
                                placeholder: "Reply in thread",
                                isConnected: isConnected,
                                isTextFocused: $isComposerFocused,
                                transitionNamespace: composerTransitionNamespace,
                                onSend: { content, attachments in
                                    guard !pending else { return false }
                                    return await onSend(content, attachments)
                                }
                            )
                        }
                    }
            }
            // Same contract as the Chat screen: the portal draws in an overlay window above the
            // keyboard, measured against the display rather than against this screen.
            .composerAttachmentPortal(
                interaction: composerInteraction,
                transitionNamespace: composerTransitionNamespace
            )
            .composerPortalFreeze(
                interaction: composerInteraction,
                isTextFocused: $isComposerFocused,
                liveBottomInset: geometry.safeAreaInsets.bottom
            )
        }
        .background(.background)
        .attachmentPreview(
            $attachmentPreview,
            images: AttachmentImagePages.pages(in: [anchor] + inlineReplyMessages + replies),
            tiles: attachmentTiles,
            onOpen: onOpenAttachment
        )
        .onChange(of: ([anchor] + inlineReplyMessages + replies).map(\.id)) { _, ids in
            visualHeights.retain(messageIDs: Set(ids))
        }
        .navigationTitle("Thread")
        .hausInlineNavigationTitle()
        .toolbar {
            if let follow {
                ToolbarItem(placement: .automatic) {
                    ThreadFollowControl(follow: follow)
                }
            }
        }
        .task(id: inlineReplies?.id) { if let inlineReplies { _ = await inlineReplies.load() } }
    }

    /// The replies sit on the same flipped-table substrate as the Chat
    /// timeline, so the bottom anchor, keyboard rides, and history prepends
    /// are structural here too. The anchor and its task metadata are simply
    /// the transcript's oldest items.
    private func transcript(
        items: [ThreadTranscriptItem],
        answerableAskMessageID: String?
    ) -> some View {
        GeometryReader { proxy in
            TranscriptListView(
                items: items,
                topInset: proxy.safeAreaInsets.top,
                bottomInset: proxy.safeAreaInsets.bottom,
                showsAccessory: history.hasOlder
                    || inlineReplies?.hasOlder() == true || inlineReplies?.hasNewer() == true,
                onAppend: { previousItems, items, isNearNewest in
                    // Anchor and task rows can precede the first fetched reply page.
                    switch ThreadReplyReveal.onLatestReplyChange(
                        previousLatestID: previousItems.last(where: { $0.replyID != nil })?.replyID,
                        isNearBottom: isNearNewest && history.followsLatest,
                        latestIsPending: items.last?.isPending == true
                    ) {
                    case .settle: .snapToNewest
                    case .animate: .animateToNewest
                    case .stay: .stay
                    }
                },
                reveal: reveal,
                isNearNewest: $isNearNewest,
                onContentTap: { isComposerFocused = false },
                onVisibleItems: onVisibleMessagesChange,
                row: { item in
                    threadRow(item, answerableAskMessageID: answerableAskMessageID)
                },
                accessory: {
                    loadOlderAccessory
                }
            )
            .ignoresSafeArea()
            // Same soft top edge as the Chat timeline, under the navigation
            // bar instead of the chat header.
            .transcriptTopDissolve(safeAreaTop: proxy.safeAreaInsets.top)
            .overlay(alignment: .bottom) {
                if !isNearNewest || history.hasNewer {
                    GlassChromeButton(.icon(.arrowDown), label: "Scroll to latest reply") {
                        Task {
                            let id = history.hasNewer ? await history.loadLatest() : replyProvider().last?.id
                            if let id {
                                reveal = TranscriptReveal(token: UUID(), id: id, animated: !history.hasNewer)
                            }
                        }
                    }
                    .padding(.bottom, 10)
                    .safeAreaPadding(.bottom)
                }
            }
        }
    }

}
