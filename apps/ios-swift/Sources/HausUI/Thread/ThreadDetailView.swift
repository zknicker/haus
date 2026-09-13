import SwiftUI

/// A native NavigationStack destination for one message thread.
///
/// The parent chat owns fetching and mutation. This view only presents the
/// anchor, task metadata, current reply state, and local pending state.
public struct ThreadDetailView: View {
    private let anchor: MessagePresentation
    private let replyProvider: () -> [MessagePresentation]
    private let pending: Bool
    private let isConnected: Bool
    private let onSend: (String, [ComposerAttachment]) async -> Bool
    private let onOpenAttachment: (MessageAttachmentPresentation) async throws -> URL
    private let hasOlderReplies: Bool
    private let isLoadingOlderReplies: Bool
    private let onLoadOlderReplies: (() async -> Bool)?
    private let onOpenAgent: (String) -> Void
    private let onCancelCloudAgent: ((String) async throws -> Void)?
    /// Nil until Server has a Thread row to follow.
    private let follow: ThreadFollow?

    @State private var draft = ""
    @State private var isNearNewest = true
    /// Same ownership rule as the Chat timeline: the screen presents, the rows
    /// only ask.
    @State private var attachmentPreview: AttachmentPreview?
    @State private var attachmentTiles = AttachmentImageTileRegistry()
    /// Visual heights are the screen's for the same structural reason attachment
    /// tiles are; see `VisualHeightRegistry`.
    @State private var visualHeights = VisualHeightRegistry()
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
        onSend: @escaping (String, [ComposerAttachment]) async -> Bool,
        onOpenAttachment: @escaping (MessageAttachmentPresentation) async throws -> URL = { attachment in
            guard let localURL = attachment.localURL else { throw CancellationError() }
            return localURL
        },
        hasOlderReplies: Bool = false,
        isLoadingOlderReplies: Bool = false,
        onLoadOlderReplies: (() async -> Bool)? = nil,
        onOpenAgent: @escaping (String) -> Void = { _ in },
        onCancelCloudAgent: ((String) async throws -> Void)? = nil,
        follow: ThreadFollow? = nil
    ) {
        self.anchor = anchor
        self.replyProvider = { replies }
        self.pending = pending
        self.isConnected = isConnected
        self.onSend = onSend
        self.onOpenAttachment = onOpenAttachment
        self.hasOlderReplies = hasOlderReplies
        self.isLoadingOlderReplies = isLoadingOlderReplies
        self.onLoadOlderReplies = onLoadOlderReplies
        self.onOpenAgent = onOpenAgent
        self.onCancelCloudAgent = onCancelCloudAgent
        self.follow = follow
    }

    /// Resolves replies while this view's body is being evaluated so an
    /// observation-backed store can invalidate the thread after its first
    /// network load.
    public init(
        anchor: MessagePresentation,
        replies: @escaping () -> [MessagePresentation],
        pending: Bool = false,
        isConnected: Bool = true,
        onSend: @escaping (String, [ComposerAttachment]) async -> Bool,
        onOpenAttachment: @escaping (MessageAttachmentPresentation) async throws -> URL = { attachment in
            guard let localURL = attachment.localURL else { throw CancellationError() }
            return localURL
        },
        hasOlderReplies: Bool = false,
        isLoadingOlderReplies: Bool = false,
        onLoadOlderReplies: (() async -> Bool)? = nil,
        onOpenAgent: @escaping (String) -> Void = { _ in },
        onCancelCloudAgent: ((String) async throws -> Void)? = nil,
        follow: ThreadFollow? = nil
    ) {
        self.anchor = anchor
        self.replyProvider = replies
        self.pending = pending
        self.isConnected = isConnected
        self.onSend = onSend
        self.onOpenAttachment = onOpenAttachment
        self.hasOlderReplies = hasOlderReplies
        self.isLoadingOlderReplies = isLoadingOlderReplies
        self.onLoadOlderReplies = onLoadOlderReplies
        self.onOpenAgent = onOpenAgent
        self.onCancelCloudAgent = onCancelCloudAgent
        self.follow = follow
    }

    public var body: some View {
        let replies = replyProvider()
        let items = transcriptItems(replies: replies)
        // The Ask a reply here would settle, read in the screen's body so an
        // Ask posted as a reply takes over the moment its Message lands.
        let answerableAskMessageID = ThreadAskAnswerability
            .answerableMessageID(rows: [anchor] + replies)
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
            images: AttachmentImagePages.pages(in: [anchor] + replies),
            tiles: attachmentTiles,
            onOpen: onOpenAttachment
        )
        .navigationTitle("Thread")
        .hausInlineNavigationTitle()
        .toolbar {
            if let follow {
                ToolbarItem(placement: .automatic) {
                    ThreadFollowControl(follow: follow)
                }
            }
        }
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
                showsAccessory: hasOlderReplies && onLoadOlderReplies != nil,
                onAppend: { previousItems, items, isNearNewest in
                    // Anchor and task rows can precede the first fetched reply page.
                    switch ThreadReplyReveal.onLatestReplyChange(
                        previousLatestID: previousItems.last(where: { $0.replyID != nil })?.replyID,
                        isNearBottom: isNearNewest,
                        latestIsPending: items.last?.isPending == true
                    ) {
                    case .settle: .snapToNewest
                    case .animate: .animateToNewest
                    case .stay: .stay
                    }
                },
                reveal: nil,
                isNearNewest: $isNearNewest,
                onContentTap: { isComposerFocused = false },
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
        }
    }

    private func transcriptItems(replies: [MessagePresentation]) -> [ThreadTranscriptItem] {
        var items: [ThreadTranscriptItem] = [.anchor(anchor, hasReplies: !replies.isEmpty)]
        if let task = anchor.task {
            items.append(.taskMetadata(task, hasReplies: !replies.isEmpty))
        }
        items.append(contentsOf: replies.map(ThreadTranscriptItem.reply))
        if pending {
            items.append(.pendingSend)
        }
        return items
    }

    @ViewBuilder
    private func threadRow(
        _ item: ThreadTranscriptItem,
        answerableAskMessageID: String?
    ) -> some View {
        switch item {
        case .anchor(let message, let hasReplies):
            messageRow(message, emphasized: true, answerableAskMessageID: answerableAskMessageID)
                .padding(.bottom, hasReplies ? 2 : 0)
        case .taskMetadata(let task, let hasReplies):
            ThreadTaskMetadataView(task: task)
                .padding(.top, 12)
                .padding(.bottom, hasReplies ? 2 : 0)
        case .reply(let message):
            messageRow(message, answerableAskMessageID: answerableAskMessageID)
                .padding(.top, 10)
        case .pendingSend:
            HStack(spacing: 7) {
                ProgressView()
                    .controlSize(.small)
                Text("Sending")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.leading, 46)
            .padding(.top, 12)
        }
    }

    private func messageRow(
        _ message: MessagePresentation,
        emphasized: Bool = false,
        answerableAskMessageID: String?
    ) -> ThreadMessageRow {
        ThreadMessageRow(
            message: message,
            emphasized: emphasized,
            onOpenAttachment: onOpenAttachment,
            preview: $attachmentPreview,
            tiles: attachmentTiles,
            visualHeights: visualHeights,
            onOpenAgent: onOpenAgent,
            onCancelCloudAgent: onCancelCloudAgent,
            answerableAskMessageID: answerableAskMessageID,
            onAnswerAsk: answerAsk
        )
    }

    /// Pressing an offered option is this screen's ordinary send: it already
    /// carries the conversation Chat and this anchor, the pair an Ask's answer
    /// takes (`AskAnswerRoute`), whichever Ask in the Thread it settles.
    private func answerAsk(_ option: String) async -> Bool {
        guard !pending else { return false }
        return await onSend(option, [])
    }

    @ViewBuilder
    private var loadOlderAccessory: some View {
        if let onLoadOlderReplies {
            Button {
                Task { @MainActor in _ = await onLoadOlderReplies() }
            } label: {
                Group {
                    if isLoadingOlderReplies {
                        ProgressView()
                    } else {
                        Label("Load older replies", systemImage: "chevron.up")
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(isLoadingOlderReplies)
            .padding(.bottom, 8)
        }
    }
}
