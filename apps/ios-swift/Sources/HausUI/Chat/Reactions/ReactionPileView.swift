import SwiftUI

/// A message's reactions as a pile of die-cut stickers on their own compact row
/// under the body, left-aligned with its text and never covering it.
///
/// Tapping a sticker toggles the viewer's own reaction with that emoji, as a
/// click does on the App. Who stuck what lives in the message's long-press
/// menu (`TranscriptReactionMenu`), where iOS keeps a row's details.
struct ReactionPileView: View {
    let messageID: String
    let reactions: [MessageReactionPresentation]
    let board: ReactionStickerBoard?
    /// The pile grows with Dynamic Type, as one piece, so the stickers keep
    /// their overlap and the "+N" keeps its place. Capped so a pile stays a
    /// compact row at accessibility sizes.
    @ScaledMetric(relativeTo: .body) private var textScale: CGFloat = 1

    /// The row: the 24pt sticker box plus a few points. The tilt and the
    /// outline may spill a little past it, never onto the text above.
    static let height: CGFloat = 28

    var body: some View {
        let pile = board?.pile(messageID: messageID, reactions: reactions)
            ?? ReactionPile.build(reactions: reactions, pending: [], viewerUserID: nil)
        if !pile.isEmpty {
            let stamps = board?.stamps(messageID: messageID) ?? [:]
            let slots = pile.stickers.count + (pile.overflow.isEmpty ? 0 : 1)
            let unit = min(textScale, 1.6)
            ZStack(alignment: .topLeading) {
                ForEach(Array(pile.stickers.enumerated()), id: \.element.id) { index, sticker in
                    ReactionStickerView(
                        messageID: messageID,
                        sticker: sticker,
                        index: index,
                        stamp: stamps[sticker.id],
                        onToggle: board.map { board in { board.toggle(messageID: messageID, sticker: sticker) } }
                    )
                    .offset(x: CGFloat(index) * ReactionPile.restStep)
                }
                if !pile.overflow.isEmpty {
                    ReactionOverflowChip(entries: pile.overflow)
                        .offset(x: CGFloat(pile.stickers.count) * ReactionPile.restStep + 3, y: 4)
                }
            }
            .scaleEffect(unit, anchor: .topLeading)
            .frame(
                width: (CGFloat(slots) * ReactionPile.restStep + 13) * unit,
                height: Self.height * unit,
                alignment: .topLeading
            )
            .padding(.top, 2)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Reactions")
        }
    }
}

/// The "+N" for reactions past the pile's first stickers.
private struct ReactionOverflowChip: View {
    let entries: [ReactionSticker]

    var body: some View {
        Text("+\(entries.count)")
            // Fixed: the whole pile scales with Dynamic Type around it.
            .font(.system(size: 11, weight: .semibold))
            .monospacedDigit()
            .foregroundStyle(.secondary)
            .padding(.horizontal, 6)
            .frame(minHeight: 20)
            .background(.fill.tertiary, in: .capsule)
            .accessibilityLabel(
                "\(entries.count) more: "
                    + entries.map { "\($0.emoji) from \($0.reactor.name)" }.joined(separator: ", ")
            )
    }
}

/// Feeds every render of a message's pile to the board, empty ones included:
/// the first pile a message shows is its baseline, so a message that had no
/// reactions must still record that, or its first live reaction would be
/// mistaken for history.
struct ReactionObservation: ViewModifier {
    let messageID: String
    let reactions: [MessageReactionPresentation]
    let board: ReactionStickerBoard?

    func body(content: Content) -> some View {
        content.onChange(of: board?.pile(messageID: messageID, reactions: reactions), initial: true) { _, pile in
            if let pile { board?.observe(messageID: messageID, reactions: reactions, pile: pile) }
        }
    }
}

/// Dips the message row 2pt on each landing frame, like something heavy hit it.
struct ReactionThud: ViewModifier {
    let stamps: [String: ReactionStamp]

    func body(content: Content) -> some View {
        let landings = stamps.values.map { $0.start.addingTimeInterval(StampMotion.landTime) }
        TimelineView(.animation(paused: landings.isEmpty)) { context in
            content.offset(y: landings.reduce(0) { offset, landing in
                offset + StampMotion.thudOffset(sinceLanding: context.date.timeIntervalSince(landing))
            })
        }
    }
}
