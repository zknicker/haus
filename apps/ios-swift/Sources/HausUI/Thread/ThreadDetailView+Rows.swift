import SwiftUI

extension ThreadDetailView {
    @ViewBuilder
    func threadRow(_ item: ThreadTranscriptItem) -> some View {
        switch item {
        case .claimMetadata(let claim):
            // Opened for a reply's claim, the title no longer names the
            // anchor's, so the card names its own.
            ThreadClaimMetadataView(
                claim: claim,
                namesClaim: ThreadOpening.opensForReplyClaim(anchor: anchor, claimMessageID: claimMessageID)
            )
                .padding(.bottom, 16)
        case .anchor(let message, let grouping):
            // A plain row, like the web Thread's: the anchor's claim is the
            // metadata card's, and the Thread is already open.
            messageRow(message, grouping: grouping, threadMark: .hidden)
        case .inlineReplies:
            if let inlineReplies {
                ThreadInlineRepliesLoader(config: inlineReplies)
            }
        case .inlineReply(let message, let grouping):
            messageRow(message, grouping: grouping, threadMark: .hidden)
        case .reply(let message, let grouping):
            messageRow(message, grouping: grouping, threadMark: .claim(isOpenedClaim: message.id == claimMessageID))
        case .dayDivider(let date):
            // The Chat timeline's divider spacing (`MessageTimelineView`).
            TranscriptDayDivider(date: date)
                .padding(.top, 12)
                .padding(.bottom, 4)
        }
    }

    /// The Chat timeline's own row, spaced as the Chat spaces it: a
    /// continuation tucks under its block, a new block opens with room, and a
    /// row that opens a day sits right under its divider.
    func messageRow(
        _ message: MessagePresentation,
        grouping: TranscriptRowGrouping,
        threadMark: MessageRowThreadMark
    ) -> some View {
        MessageTimelineRow(
            message: message,
            isContinuation: grouping.isContinuation,
            showsReplyReference: grouping.showsReplyReference,
            isHighlighted: highlightedMessageID == message.id,
            isPressed: isPressed(message),
            attachmentPreview: $attachmentPreview,
            attachmentTiles: attachmentTiles,
            visualHeights: visualHeights,
            reactionBoard: reactionBoard,
            onOpenThread: {},
            onOpenInlineReply: revealInlineReply,
            onOpenAttachment: onOpenAttachment,
            accessibilityActions: accessibilityActions(for: message),
            threadMark: threadMark
        )
        .padding(.top, grouping.startsDay ? 0 : grouping.isContinuation ? 4 : 16)
    }

    /// A reference's tap reveals and highlights the message it names when the
    /// Thread is showing it — the anchor, or an earlier reply. A message the
    /// Thread does not carry has nowhere to go here.
    func revealInlineReply(_ reference: MessageReplyReferencePresentation) {
        guard let item = projection.items.first(where: { $0.message?.id == reference.id }) else { return }
        reveal = TranscriptReveal(token: UUID(), id: item.id, animated: true)
        highlightedMessageID = reference.id
    }

    /// The Chat timeline's highlight: held a moment, then faded.
    func fadeHighlight() async {
        guard highlightedMessageID != nil else { return }
        try? await Task.sleep(for: .milliseconds(1_500))
        guard !Task.isCancelled else { return }
        withAnimation(.easeOut(duration: 0.45)) { highlightedMessageID = nil }
    }

    /// Inside the Thread the drawer offers reactions and copying; VoiceOver
    /// gets the same.
    func accessibilityActions(for message: MessagePresentation) -> MessageRowAccessibilityActions {
        .forMessage(
            message,
            canReplyInline: false,
            canOpenThread: false,
            onReact: { actionMessage = message },
            onReply: {},
            onOpenThread: {},
            onConvertToTask: MessageActionRoutes.convertToTaskAction(for: message)
        )
    }

    /// The message a row's long press opens the drawer for: a durable anchor
    /// or reply, never the claim facts or a send still in flight.
    static func drawerMessage(for item: ThreadTranscriptItem) -> MessagePresentation? {
        item.message.flatMap { $0.isPending ? nil : $0 }
    }

    /// Everything a row draws from beyond its item, read in the screen's own
    /// body so a change re-hosts the visible rows: a visual's height report,
    /// an image tile's settled box, a pending own reaction, the press tint,
    /// and the parent chain's and history's load state that the accessory
    /// rows show.
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
        if let inlineReplies {
            hasher.combine(inlineReplies.isLoaded())
            hasher.combine(inlineReplies.isLoading())
            hasher.combine(inlineReplies.hasOlder())
            hasher.combine(inlineReplies.hasNewer())
        }
        return hasher.finalize()
    }

    /// Whether a row shows the press tint: held now, or its drawer is open.
    func isPressed(_ message: MessagePresentation) -> Bool {
        message.id == heldMessageID || message.id == actionMessage?.id
    }
}
