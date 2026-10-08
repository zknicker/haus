import SwiftUI

#if canImport(UIKit)
import UIKit
#endif

public struct MessageTimelineView: View {
    let messages: [MessagePresentation]
    let isMessageHistoryLoaded: Bool
    private let emptyStateDescription: String
    let onOpenThread: (MessagePresentation) -> Void
    /// A tap on the transcript itself, not on a row control; the screen puts the keyboard away.
    private let onContentTap: () -> Void
    let allowsInlineReplies: Bool
    let onSelectInlineReply: (MessagePresentation) -> Void
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
    /// Per-page work, done once per page; see `MessageTimelineProjection`.
    @State private var projection = MessageTimelineProjection()
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
    @State var actionMessage: MessagePresentation?
    /// The message a resting finger is holding, before and through its long
    /// press. Together with `actionMessage` it tints the row.
    @State private var heldMessageID: String?

    public init(
        messages: [MessagePresentation],
        isMessageHistoryLoaded: Bool = true,
        emptyStateDescription: String = "Send a message to start the conversation.",
        onOpenThread: @escaping (MessagePresentation) -> Void,
        onContentTap: @escaping () -> Void = {},
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
        self.onContentTap = onContentTap
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
        projection.update(messages)
        let entries = projection.entries
        // Read here, in the screen's own body, so each input subscribes this
        // body; see `rowRevision`.
        let rowRevision = rowRevision
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
                .contentShape(.rect)
                .onTapGesture(perform: onContentTap)
            } else {
                TranscriptListView(
                    items: entries,
                    topInset: proxy.safeAreaInsets.top,
                    bottomInset: proxy.safeAreaInsets.bottom,
                    showsAccessory: history.hasOlder,
                    onAppend: { _, items, isNearNewest in
                        appendBehavior(items, isNearNewest: isNearNewest)
                    },
                    reveal: reveal,
                    isNearNewest: $isNearNewest,
                    onContentTap: onContentTap,
                    onVisibleItems: onVisibleMessagesChange,
                    animatesEntrance: opensWithEntrance,
                    onLongPress: { entry in
                        if !entry.message.isPending { actionMessage = entry.message }
                    },
                    // A pending message opens no drawer, so it takes no tint.
                    onHoldChange: { entry in
                        heldMessageID = entry?.message.isPending == false ? entry?.id : nil
                    },
                    rowRevision: rowRevision,
                    row: { entry in
                        timelineRow(entry)
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
                TranscriptJumpButton(label: "Scroll to latest message") {
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
            images: projection.imagePages,
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
        .onChange(of: projection.messageIDs) { _, ids in
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

    /// Everything a row draws from beyond its entry. Read here, in the
    /// screen's own body, so a visual's height report, a pending own
    /// reaction, or a press re-renders the screen and the table re-hosts its
    /// visible rows: the rows read these inside the table's row closure, which
    /// SwiftUI does not track as this body's dependency.
    private var rowRevision: Int {
        var hasher = Hasher()
        hasher.combine(visualHeights.revision)
        hasher.combine(reactionBoard?.revision)
        hasher.combine(heldMessageID)
        hasher.combine(actionMessage?.id)
        hasher.combine(highlightedMessageID)
        hasher.combine(history.hasOlder)
        hasher.combine(history.isLoading)
        return hasher.finalize()
    }

    private func appendBehavior(
        _ items: [MessageTimelineEntry],
        isNearNewest: Bool
    ) -> TranscriptAppendBehavior {
        let isLatestPending = items.last?.message.isPending == true
        switch MessageTimelineTailScroll.decide(
            hadMessages: true,
            isNearBottom: isNearNewest && history.followsLatest,
            isLatestPending: isLatestPending
        ) {
        case .ignore: return .stay
        case .snap: return .snapToNewest
        // The reader's own send lands whole; anyone else's reply is read from
        // its top.
        case .animate: return isLatestPending ? .animateToNewest : .followNewest
        }
    }

    @ViewBuilder
    private func timelineRow(_ entry: MessageTimelineEntry) -> some View {
        let message = entry.message
        let grouping = entry.grouping
        VStack(alignment: .leading, spacing: 0) {
            if grouping.startsDay {
                TranscriptDayDivider(date: message.createdAt)
                    .padding(.top, entry.isFirst ? 0 : 12)
                    .padding(.bottom, 4)
            }
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
                onOpenAttachment: onOpenAttachment,
                accessibilityActions: rowAccessibilityActions(for: message)
            )
            .padding(.top, entry.isFirst || grouping.startsDay ? 0 : grouping.isContinuation ? 4 : 16)
        }
    }
}
