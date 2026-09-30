import Foundation
import Testing
@testable import HausUI

/// The board turns ledger answers into stamps a row can draw.
@MainActor
struct ReactionStickerBoardTests {
    private let tiny = ReactorPresentation(id: "agent_tiny", name: "Tiny")

    /// Regression: a message that first rendered with no reactions must still
    /// record that empty baseline, or its first live reaction lands at rest.
    @Test func firstLiveReactionOnAnEmptyMessageStamps() {
        let board = ReactionStickerBoard()
        let empty = board.pile(messageID: "m1", reactions: [])
        board.observe(messageID: "m1", reactions: [], pile: empty)

        board.noteLive(messageID: "m1", eventAt: .now)
        let reactions = [MessageReactionPresentation(emoji: "😊", reactors: [tiny])]
        board.observe(messageID: "m1", reactions: reactions, pile: board.pile(messageID: "m1", reactions: reactions))

        #expect(board.stamps(messageID: "m1").keys.sorted() == [ReactionPile.key(emoji: "😊", reactorID: "agent_tiny")])
    }

    @Test func ownAddShowsPendingAndStampsBeforeTheServerAnswers() {
        let board = ReactionStickerBoard()
        board.observe(messageID: "m1", reactions: [], pile: board.pile(messageID: "m1", reactions: []))

        board.addPending(messageID: "m1", emoji: "❤️", viewerUserID: "user_1")
        let pile = board.pile(messageID: "m1", reactions: [])
        board.observe(messageID: "m1", reactions: [], pile: pile)

        #expect(pile.stickers.map(\.emoji) == ["❤️"])
        #expect(board.stamps(messageID: "m1").count == 1)
    }

    @Test func historyNeverStamps() {
        let board = ReactionStickerBoard()
        let reactions = [MessageReactionPresentation(emoji: "😊", reactors: [tiny])]
        board.noteLive(messageID: "m1", eventAt: .now)
        board.observe(messageID: "m1", reactions: reactions, pile: board.pile(messageID: "m1", reactions: reactions))

        #expect(board.stamps(messageID: "m1").isEmpty)
    }

    /// A reaction chosen from the menu or the emoji picker waits for that
    /// surface to close before it stamps.
    @Test func coveredAddStampsAfterItsDelay() {
        let board = ReactionStickerBoard()
        // The pile reads pending adds against the clock, so this runs on it.
        let now = Date()
        board.observe(messageID: "m1", reactions: [], pile: board.pile(messageID: "m1", reactions: []), now: now)

        board.toggle(messageID: "m1", emoji: "🦖", remove: false, stampDelay: 0.5)
        board.addPending(messageID: "m1", emoji: "🦖", viewerUserID: "user_1", now: now)
        board.observe(messageID: "m1", reactions: [], pile: board.pile(messageID: "m1", reactions: []), now: now)

        #expect(board.stamps(messageID: "m1").values.map(\.start) == [now.addingTimeInterval(0.5)])
    }
}
