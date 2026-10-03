import SwiftUI

#if canImport(UIKit)
import UIKit
#endif

public struct MessageTimelineView: View {
    let messages: [MessagePresentation]
    let isMessageHistoryLoaded: Bool
    private let emptyStateDescription: String
    private let onOpenThread: (MessagePresentation) -> Void
    private let allowsInlineReplies: Bool
    private let onSelectInlineReply: (MessagePresentation) -> Void
    private let onOpenAttachment: (MessageAttachmentPresentation) async throws -> URL
    private let onOpenAgent: (String) -> Void
    let history: MessageHistoryNavigation
    /// The message ids the viewport is showing, whenever that set changes.
    /// Read acknowledgement is built on this: a message is read when it has
    /// been on screen, not when its page happened to load.
    private let onVisibleMessagesChange: ([String]) -> Void

    @Binding var scrollTargetMessageID: String?
    /// Attachment presentation is the screen's, not the row's: rows are hosted
    /// in table cells with no view controller of their own, and the image
    /// viewer's transition has to outlive the cell it grew out of.
    @State private var attachmentPreview: AttachmentPreview?
    @State private var attachmentTiles = AttachmentImageTileRegistry()
    /// Visual heights are the screen's for the same structural reason
    /// attachment tiles are: rows live in table cells the screen has to
    /// re-host. See `VisualHeightRegistry`.
    @State private var visualHeights = VisualHeightRegistry()
    @State var highlightedMessageID: String?
    @State private var isNearNewest = true
    @State var reveal: TranscriptReveal?
    @State var historyRevealTarget: MessageHistoryRevealTarget?
    @State var historyRevealAttempt = 0
    @State var historyRevealError: String?
    /// The transcript's opening settle runs inside the table (see
    /// `TranscriptListView.animatesEntrance`), so the flag is read here rather
    /// than through the `openingEntrance` modifier.
    @Environment(\.opensWithEntrance) private var opensWithEntrance
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    /// Rows are hosted in table cells, which do not inherit this environment,
    /// so the screen reads the board and hands it to each row.
    @Environment(\.reactionStickers) private var reactionBoard
    /// The message whose long-press drawer is open.
    @State private var actionMessage: MessagePresentation?
    /// The message a resting finger is holding, before and through its long
    /// press. Together with `actionMessage` it tints the row.
    @State private var heldMessageID: String?

    public init(
        messages: [MessagePresentation],
        isMessageHistoryLoaded: Bool = true,
        emptyStateDescription: String = "Send a message to start the conversation.",
        onOpenThread: @escaping (MessagePresentation) -> Void,
        allowsInlineReplies: Bool = false,
        onSelectInlineReply: @escaping (MessagePresentation) -> Void = { _ in },
        onOpenAttachment: @escaping (MessageAttachmentPresentation) async throws -> URL = { attachment in
            guard let localURL = attachment.localURL else { throw CancellationError() }
            return localURL
        },
        onOpenAgent: @escaping (String) -> Void = { _ in },
        history: MessageHistoryNavigation = .init(),
        scrollTargetMessageID: Binding<String?> = .constant(nil),
        onVisibleMessagesChange: @escaping ([String]) -> Void = { _ in }
    ) {
        _scrollTargetMessageID = scrollTargetMessageID
        self.onVisibleMessagesChange = onVisibleMessagesChange
        self.messages = messages
        self.isMessageHistoryLoaded = isMessageHistoryLoaded
        self.emptyStateDescription = emptyStateDescription
        self.onOpenThread = onOpenThread
        self.allowsInlineReplies = allowsInlineReplies
        self.onSelectInlineReply = onSelectInlineReply
        self.onOpenAttachment = onOpenAttachment
        self.onOpenAgent = onOpenAgent
        self.history = history
    }

    /// The transcript sits on `TranscriptListView` — the flipped-table
    /// substrate — so the bottom anchor, keyboard rides, history prepends, and
    /// first-paint settling are all structural rather than managed here. This
    /// view owns only presentation: rows, the reveal request, the highlight,
    /// and the scroll-to-latest chevron. The caller's `safeAreaInset` and
    /// `chromeBar` land here as safe areas and are handed to the list as
    /// explicit clearances, so the transcript runs to the screen edges and
    /// passes under the header's and the composer's glass.
    public var body: some View {
        let indexByID = messageIndexByID
        // Read here, in the screen's own body, so a visual's height report
        // re-renders the screen and the table re-hosts its visible rows. The
        // card reads the registry too, but a cell's hosting view invalidating
        // itself is not what re-measures the row: only a change ABOVE the table
        // reaches `updateUIView` and its `reconfigureVisibleRows`. Every screen
        // that owns a registry has to read `revision` for its cards to grow.
        _ = visualHeights.revision
        // The same for a pending own reaction, which grows a row's pile before
        // any page changes.
        _ = reactionBoard?.revision
        // And for the press tint: rows read these inside the table's row
        // closure, which SwiftUI does not track as this body's dependency.
        _ = (heldMessageID, actionMessage?.id)
        return GeometryReader { proxy in
            if messages.isEmpty && isMessageHistoryLoaded {
                ContentUnavailableView(
                    "No messages yet",
                    systemImage: "bubble.left",
                    description: Text(emptyStateDescription)
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.top, proxy.safeAreaInsets.top)
                .padding(
                    .bottom,
                    dynamicTypeSize.isAccessibilitySize ? 0 : proxy.size.height * 0.175
                )
                .ignoresSafeArea()
            } else {
                TranscriptListView(
                    items: messages,
                    topInset: proxy.safeAreaInsets.top,
                    bottomInset: proxy.safeAreaInsets.bottom,
                    showsAccessory: history.hasOlder,
                    onAppend: { _, items, isNearNewest in
                        switch MessageTimelineTailScroll.decide(
                            hadMessages: true,
                            isNearBottom: isNearNewest && history.followsLatest,
                            isLatestPending: items.last?.isPending == true
                        ) {
                        case .ignore: .stay
                        case .snap: .snapToNewest
                        case .animate: .animateToNewest
                        }
                    },
                    reveal: reveal,
                    isNearNewest: $isNearNewest,
                    onVisibleItems: onVisibleMessagesChange,
                    animatesEntrance: opensWithEntrance,
                    onLongPress: { message in
                        if !message.isPending { actionMessage = message }
                    },
                    // A pending message opens no drawer, so it takes no tint.
                    onHoldChange: { message in
                        heldMessageID = message?.isPending == false ? message?.id : nil
                    },
                    row: { message in
                        timelineRow(message, indexByID: indexByID)
                    },
                    accessory: {
                        loadOlderAccessory
                    }
                )
                .ignoresSafeArea()
                // The bottom edge stays hard on purpose: the composer's clearance
                // is the transcript's scroll bound, and its glass refracts the
                // rows that reach it.
                .transcriptTopDissolve(safeAreaTop: proxy.safeAreaInsets.top)
            }
        }
        // The scroll clearance the composer reserves arrives as this view's bottom safe
        // area, so the button rides above the glass instead of under it.
        .overlay(alignment: .bottom) {
            if !isNearNewest || history.hasNewer {
                GlassChromeButton(.icon(.arrowDown), label: "Scroll to latest message") {
                    requestHistoryReveal(.latest)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .padding(.bottom, 10)
                .safeAreaPadding(.bottom)
            }
        }
        .animation(.easeOut(duration: 0.18), value: isNearNewest)
        .attachmentPreview(
            $attachmentPreview,
            images: AttachmentImagePages.pages(in: messages),
            tiles: attachmentTiles,
            onOpen: onOpenAttachment
        )
        .onChange(of: scrollTargetMessageID, initial: true) { _, target in
            if let target { requestHistoryReveal(.message(target)) }
        }
        .task(id: historyRevealAttempt) {
            await resolveHistoryReveal()
        }
        .messageActionDrawer(
            for: $actionMessage,
            board: reactionBoard,
            onReply: allowsInlineReplies ? onSelectInlineReply : nil,
            onOpenThread: onOpenThread
        )
        .alert("Message unavailable", isPresented: historyRevealErrorPresented) {
            Button("Retry") {
                historyRevealError = nil
                historyRevealAttempt += 1
            }
            Button("Cancel", role: .cancel) {
                historyRevealError = nil
                historyRevealTarget = nil
                scrollTargetMessageID = nil
            }
        } message: {
            Text(historyRevealError ?? "The message could not be loaded.")
        }
        .onChange(of: messages.map(\.id)) { _, ids in
            visualHeights.retain(messageIDs: Set(ids))
        }
        .task(id: highlightedMessageID) {
            guard highlightedMessageID != nil else { return }
            try? await Task.sleep(for: .milliseconds(1_500))
            guard !Task.isCancelled else { return }
            withAnimation(.easeOut(duration: 0.45)) { highlightedMessageID = nil }
        }
    }

    @ViewBuilder
    private var loadOlderAccessory: some View {
        if history.hasOlder {
            TranscriptLoadOlderButton(
                title: "Load older messages",
                isLoading: history.isLoading,
                onLoad: history.loadOlder
            )
        }
    }

    /// Row lookups run once per hosted row on every update, so the index is a
    /// dictionary rather than a scan of the page.
    private var messageIndexByID: [String: Int] {
        Dictionary(
            uniqueKeysWithValues: messages.enumerated().map { ($0.element.id, $0.offset) }
        )
    }

    @ViewBuilder
    private func timelineRow(_ message: MessagePresentation, indexByID: [String: Int]) -> some View {
        let index = indexByID[message.id] ?? 0
        let grouping = TranscriptRowGrouping(message, after: index > 0 ? messages[index - 1] : nil)
        MessageTimelineRow(
            message: message,
            isContinuation: grouping.isContinuation,
            showsReplyReference: grouping.showsReplyReference,
            isHighlighted: highlightedMessageID == message.id,
            isPressed: message.id == heldMessageID || message.id == actionMessage?.id,
            attachmentPreview: $attachmentPreview,
            attachmentTiles: attachmentTiles,
            visualHeights: visualHeights,
            reactionBoard: reactionBoard,
            onOpenThread: { onOpenThread(message) },
            onOpenInlineReply: requestInlineReply,
            onOpenAttachment: onOpenAttachment
        )
        .padding(.top, index == 0 ? 0 : grouping.isContinuation ? 4 : 16)
    }
}
