import SwiftUI

#if canImport(UIKit)
import UIKit
#endif

public struct MessageTimelineView: View {
    let messages: [MessagePresentation]
    let isMessageHistoryLoaded: Bool
    private let emptyStateDescription: String
    /// A tap on the transcript itself, not on a row control; the screen puts the keyboard away.
    private let onContentTap: () -> Void
    let allowsInlineReplies: Bool
    let onSelectInlineReply: (MessagePresentation) -> Void
    let onOpenAttachment: (MessageAttachmentPresentation) async throws -> URL
    private let onOpenAgent: (String) -> Void
    let history: MessageHistoryNavigation
    /// How rows are laid out: the assistant layout for Captain DMs and Task
    /// chats, roster rows for Projects.
    let style: TranscriptStyle
    /// The first message the reader has not read, which the unread jump
    /// brings into view.
    let unreadMessageID: String?
    /// The message ids the viewport is showing, whenever that set changes.
    /// Read acknowledgement is built on this: a message is read when it has
    /// been on screen, not when its page happened to load.
    let onVisibleMessagesChange: ([String]) -> Void

    @Binding var scrollTargetMessageID: String?
    /// Attachment presentation is the screen's, not the row's: rows are hosted
    /// in table cells with no view controller of their own, and the image
    /// viewer's transition has to outlive the cell it grew out of.
    @State var attachmentPreview: AttachmentPreview?
    @State var attachmentTiles = AttachmentImageTileRegistry()
    /// Visual heights are the screen's for the same structural reason
    /// attachment tiles are: rows live in table cells the screen has to
    /// re-host. See `VisualHeightRegistry`.
    @State var visualHeights = VisualHeightRegistry()
    /// Per-page work, done once per page; see `MessageTimelineProjection`.
    @State private var projection = MessageTimelineProjection()
    @State var highlightedMessageID: String?
    @State var isNearNewest = true
    @State var reveal: TranscriptReveal?
    @State var historyRevealTarget: MessageHistoryRevealTarget?
    @State var historyRevealAttempt = 0
    @State var historyRevealError: String?
    @State var unreadJump = TranscriptUnreadJump(messageID: nil)
    @AppStorage(ScrollNewMessagesToTop.storageKey)
    var scrollsNewMessagesToTop = ScrollNewMessagesToTop.defaultValue
    /// The transcript's opening settle runs inside the table (see
    /// `TranscriptListView.animatesEntrance`), so the flag is read here rather
    /// than through the `openingEntrance` modifier.
    @Environment(\.opensWithEntrance) private var opensWithEntrance
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    /// Rows are hosted in table cells, which do not inherit this environment,
    /// so the screen reads the board and hands it to each row.
    @Environment(\.reactionStickers) var reactionBoard
    /// The message whose long-press drawer is open.
    @State var actionMessage: MessagePresentation?
    /// The message a resting finger is holding, before and through its long
    /// press. Together with `actionMessage` it tints the row.
    @State var heldMessageID: String?

    public init(
        messages: [MessagePresentation],
        isMessageHistoryLoaded: Bool = true,
        emptyStateDescription: String = "Send a message to start the conversation.",
        style: TranscriptStyle = .roster,
        unreadMessageID: String? = nil,
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
        self.style = style
        self.unreadMessageID = unreadMessageID
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
    /// and the explicit jumps. The caller's `safeAreaInset` and `chromeBar`
    /// land here as safe areas and are handed to the list as explicit
    /// clearances, so the transcript runs to the screen edges and passes under
    /// the header's and the composer's glass.
    public var body: some View {
        projection.update(messages, style: style)
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
                    onVisibleItems: observeVisibleMessages,
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
        // area, so the jumps ride above the glass instead of under it.
        .overlay(alignment: .bottomTrailing) { jumpStack }
        .animation(.easeOut(duration: 0.18), value: jumps)
        .attachmentPreview(
            $attachmentPreview,
            images: projection.imagePages,
            tiles: attachmentTiles,
            onOpen: onOpenAttachment
        )
        .onChange(of: scrollTargetMessageID, initial: true) { _, target in
            if let target { requestHistoryReveal(.message(target)) }
        }
        .onChange(of: unreadMessageID, initial: true) { _, id in
            unreadJump = TranscriptUnreadJump(messageID: id)
        }
        .task(id: historyRevealAttempt) {
            await resolveHistoryReveal()
        }
        .messageActionDrawer(
            for: $actionMessage,
            board: reactionBoard,
            onReply: allowsInlineReplies ? onSelectInlineReply : nil
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

    private func observeVisibleMessages(_ ids: [String]) {
        if unreadJump.messageID != nil {
            let next = unreadJump.observing(visibleIDs: ids, loadedIDs: projection.messageIDs)
            if next != unreadJump { unreadJump = next }
        }
        onVisibleMessagesChange(ids)
    }
}
