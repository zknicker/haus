import SwiftUI

/// A native NavigationStack destination for one message thread.
///
/// The parent chat owns fetching and mutation. This view only presents the
/// anchor, task metadata, and current reply state.
public struct ThreadDetailView: View {
    private let anchor: MessagePresentation
    private let replyProvider: () -> [MessagePresentation]
    private let isConnected: Bool
    /// Whether this conversation refuses new Messages — an archived Chat, or a
    /// DM whose peer Agent was retired (`ChatSummary.isReadOnly`). The Thread
    /// keeps its transcript and loses its composer.
    private let isReadOnly: Bool
    let onSend: (String, [ComposerAttachment]) async -> Bool
    let onOpenAttachment: (MessageAttachmentPresentation) async throws -> URL
    let history: MessageHistoryNavigation
    let inlineReplies: ThreadInlineReplies?
    let onOpenAgent: (String) -> Void
    /// Nil until Server has a Thread row to follow.
    private let follow: ThreadFollow?
    /// The Thread's own Chat, whose engaged Agents the header row shows.
    /// Nil until the first reply creates it.
    private let engagementChatID: String?
    /// How that row reads: the channel roster, or a DM Thread's thought subtitle.
    private let engagementStyle: HeaderEngagementStyle
    /// The reply ids the transcript is showing. Read acknowledgement is built
    /// on this; the anchor and task rows carry no Server sequence, so the App
    /// simply cannot resolve them.
    private let onVisibleMessagesChange: ([String]) -> Void
    /// Where the Thread lives — "#design", or "DM" — shown under the title.
    private let contextLabel: String?

    @State private var draft = ""
    @State private var projection = ThreadTranscriptProjection()
    /// A Thread known to have replies opens blank until its first reply page
    /// lands, so the push never shows the anchor first and then snaps to the
    /// newest reply. See `ThreadOpening`.
    @State private var awaitsFirstReplies: Bool
    /// Whether the navigation subtitle reads "Connecting…" (`ConnectionOutage`).
    @State private var showsOutage = false
    @State private var isNearNewest = true
    @State private var reveal: TranscriptReveal?
    /// Same ownership rule as the Chat timeline: the screen presents, the rows
    /// only ask.
    @State var attachmentPreview: AttachmentPreview?
    @State var attachmentTiles = AttachmentImageTileRegistry()
    /// Visual heights are the screen's for the same structural reason attachment
    /// tiles are; see `VisualHeightRegistry`.
    @State var visualHeights = VisualHeightRegistry()
    /// Hosted rows do not inherit the environment; see `MessageTimelineView`.
    @Environment(\.reactionStickers) var reactionBoard
    /// The message whose long-press drawer is open.
    @State var actionMessage: MessagePresentation?
    /// The message a resting finger is holding; with `actionMessage` it tints
    /// the row. See `MessageTimelineView`.
    @State var heldMessageID: String?
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
        follow: ThreadFollow? = nil,
        contextLabel: String? = nil,
        engagementChatID: String? = nil,
        engagementStyle: HeaderEngagementStyle = .roster,
        onVisibleMessagesChange: @escaping ([String]) -> Void = { _ in }
    ) {
        self.anchor = anchor
        self.replyProvider = { replies }
        self.contextLabel = contextLabel
        _awaitsFirstReplies = State(initialValue: ThreadOpening.awaitsFirstReplies(anchor: anchor))
        self.isConnected = isConnected
        self.isReadOnly = isReadOnly
        self.onSend = onSend
        self.onOpenAttachment = onOpenAttachment
        self.history = history
        self.inlineReplies = inlineReplies
        self.onOpenAgent = onOpenAgent
        self.follow = follow
        self.engagementChatID = engagementChatID
        self.engagementStyle = engagementStyle
        self.onVisibleMessagesChange = onVisibleMessagesChange
    }

    /// Resolves replies while this view's body is being evaluated so an
    /// observation-backed store can invalidate the thread after its first
    /// network load.
    public init(
        anchor: MessagePresentation,
        replies: @escaping () -> [MessagePresentation],
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
        follow: ThreadFollow? = nil,
        contextLabel: String? = nil,
        engagementChatID: String? = nil,
        engagementStyle: HeaderEngagementStyle = .roster,
        onVisibleMessagesChange: @escaping ([String]) -> Void = { _ in }
    ) {
        self.anchor = anchor
        self.replyProvider = replies
        self.contextLabel = contextLabel
        _awaitsFirstReplies = State(initialValue: ThreadOpening.awaitsFirstReplies(anchor: anchor))
        self.isConnected = isConnected
        self.isReadOnly = isReadOnly
        self.onSend = onSend
        self.onOpenAttachment = onOpenAttachment
        self.history = history
        self.inlineReplies = inlineReplies
        self.onOpenAgent = onOpenAgent
        self.follow = follow
        self.engagementChatID = engagementChatID
        self.engagementStyle = engagementStyle
        self.onVisibleMessagesChange = onVisibleMessagesChange
    }

    public var body: some View {
        let replies = replyProvider()
        let inlineReplyMessages = inlineReplies?.messages() ?? []
        projection.update(
            anchor: anchor,
            replies: replies,
            includesInlineReplies: inlineReplies != nil,
            inlineReplies: inlineReplyMessages
        )
        let items = projection.items
        // Read here, in the screen's own body, so each input subscribes this
        // body; see `rowRevision`.
        let rowRevision = rowRevision
        let isHoldingOpen = awaitsFirstReplies && replies.isEmpty

        return GeometryReader { geometry in
            ZStack(alignment: .bottomLeading) {
                transcript(items: items, rowRevision: rowRevision)
                    .opacity(isHoldingOpen ? 0 : 1)
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
                                isTextFocused: $isComposerFocused,
                                transitionNamespace: composerTransitionNamespace,
                                onSend: onSend
                            )
                        }
                    }
            }
            // Who is answering hangs just under the navigation bar's subtitle,
            // over the transcript rather than in its layout.
            .overlay(alignment: .top) {
                if let engagementChatID {
                    HeaderEngagement(chatID: engagementChatID, style: engagementStyle, underNavigationBar: true)
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
            images: projection.imagePages,
            tiles: attachmentTiles,
            onOpen: onOpenAttachment
        )
        .onChange(of: projection.messageIDs) { _, ids in
            visualHeights.retain(messageIDs: Set(ids))
        }
        .threadNavigationTitle(
            ThreadOpening.title(anchor: anchor),
            subtitle: showsOutage ? ConnectionOutage.title : contextLabel
        )
        .connectionOutage(isConnected: isConnected, showsOutage: $showsOutage)
        .toolbar {
            if let follow {
                ToolbarItem(placement: .automatic) {
                    ThreadFollowControl(follow: follow)
                }
            }
        }
        .task(id: inlineReplies?.id) { if let inlineReplies { _ = await inlineReplies.load() } }
        // A first page that never comes (offline, a failed fetch) must not
        // leave the Thread blank.
        .task {
            guard awaitsFirstReplies else { return }
            try? await Task.sleep(for: ThreadOpening.holdLimit)
            awaitsFirstReplies = false
        }
        // Already in the Thread, so the drawer offers reactions and copying.
        .messageActionDrawer(for: $actionMessage, board: reactionBoard)
    }

    /// The replies sit on the same flipped-table substrate as the Chat
    /// timeline, so the bottom anchor, keyboard rides, and history prepends
    /// are structural here too. The anchor and its task metadata are simply
    /// the transcript's oldest items.
    private func transcript(items: [ThreadTranscriptItem], rowRevision: Int) -> some View {
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
                    // The viewer's own send lands whole; anyone else's reply
                    // is read from its top.
                    case .animate: items.last?.isPending == true ? .animateToNewest : .followNewest
                    case .stay: .stay
                    }
                },
                reveal: reveal,
                isNearNewest: $isNearNewest,
                onContentTap: { isComposerFocused = false },
                onVisibleItems: onVisibleMessagesChange,
                onLongPress: { item in actionMessage = Self.drawerMessage(for: item) },
                onHoldChange: { item in heldMessageID = item.flatMap(Self.drawerMessage(for:))?.id },
                rowRevision: rowRevision,
                row: { item in threadRow(item) },
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
                    TranscriptJumpButton(label: "Scroll to latest reply") {
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
