import SwiftUI

/// The rows the timeline hands its table, and how a new tail row lands.
extension MessageTimelineView {
    @ViewBuilder
    func timelineRow(_ entry: MessageTimelineEntry) -> some View {
        let message = entry.message
        let grouping = entry.grouping
        VStack(alignment: .leading, spacing: 0) {
            switch grouping.divider {
            case .day:
                TranscriptDayDivider(date: message.createdAt)
                    .padding(.top, entry.isFirst ? 0 : 12)
                    .padding(.bottom, 4)
            case .time:
                TranscriptTimeDivider(date: message.createdAt)
                    .padding(.top, entry.isFirst ? 0 : 14)
                    .padding(.bottom, 8)
            case nil:
                EmptyView()
            }
            MessageTimelineRow(
                message: message,
                isContinuation: grouping.isContinuation,
                showsReplyReference: grouping.showsReplyReference,
                showsCopy: entry.endsRun,
                isHighlighted: highlightedMessageID == message.id,
                isPressed: message.id == heldMessageID || message.id == actionMessage?.id,
                attachmentPreview: $attachmentPreview,
                attachmentTiles: attachmentTiles,
                visualHeights: visualHeights,
                reactionBoard: reactionBoard,
                onOpenInlineReply: requestInlineReply,
                onOpenAttachment: onOpenAttachment,
                accessibilityActions: rowAccessibilityActions(for: message),
                style: entry.style
            )
            .padding(.top, entry.topSpacing)
        }
    }

    @ViewBuilder
    var loadOlderAccessory: some View {
        if history.hasOlder {
            TranscriptLoadOlderButton(
                title: "Load older messages",
                isLoading: history.isLoading,
                onLoad: history.loadOlder
            )
        }
    }

    /// Everything a row draws from beyond its entry. Read here, in the
    /// screen's own body, so a visual's height report, an image tile's settled
    /// box, a pending own reaction, or a press re-renders the screen and the
    /// table re-hosts its visible rows: the rows read these inside the table's
    /// row closure, which SwiftUI does not track as this body's dependency.
    var rowRevision: Int {
        var hasher = Hasher()
        hasher.combine(visualHeights.revision)
        hasher.combine(attachmentTiles.revision)
        hasher.combine(reactionBoard?.revision)
        hasher.combine(heldMessageID)
        hasher.combine(actionMessage?.id)
        hasher.combine(highlightedMessageID)
        hasher.combine(history.hasOlder)
        hasher.combine(history.isLoading)
        return hasher.finalize()
    }

    func appendBehavior(
        _ items: [MessageTimelineEntry],
        isNearNewest: Bool
    ) -> TranscriptAppendBehavior {
        MessageTimelineTailScroll.behavior(
            decision: MessageTimelineTailScroll.decide(
                hadMessages: true,
                isNearBottom: isNearNewest && history.followsLatest,
                isLatestPending: items.last?.message.isPending == true
            ),
            isLatestPending: items.last?.message.isPending == true,
            scrollsNewMessagesToTop: scrollsNewMessagesToTop
        )
    }
}

extension MessageTimelineTailScroll {
    /// What the list does with a tail decision. The reader's own send lands
    /// whole — at the top with room for the reply when "Scroll new messages to
    /// top" is on — and anyone else's reply is read from its top.
    static func behavior(
        decision: Self,
        isLatestPending: Bool,
        scrollsNewMessagesToTop: Bool
    ) -> TranscriptAppendBehavior {
        switch decision {
        case .ignore: .stay
        case .snap: .snapToNewest
        case .animate where isLatestPending: scrollsNewMessagesToTop ? .landAtTop : .animateToNewest
        case .animate: .followNewest
        }
    }
}
