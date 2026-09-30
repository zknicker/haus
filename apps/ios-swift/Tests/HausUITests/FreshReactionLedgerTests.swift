import Foundation
import Testing
@testable import HausUI

/// Only a reaction that arrived live stamps: a realtime event or the viewer's
/// own add. History, reloads, and relaunches render at rest.
struct FreshReactionLedgerTests {
    private let now = Date(timeIntervalSince1970: 1_000)
    private let tiny = ReactionPile.key(emoji: "👍", reactorID: "agent_tiny")
    private let mine = ReactionPile.key(emoji: "❤️", reactorID: "user_1")

    @Test func firstSightOfAMessageIsHistory() {
        var ledger = FreshReactionLedger()
        ledger.noteLive(messageID: "m1", eventAt: now, now: now)

        // Even inside a live window, the first render only sets a baseline.
        #expect(ledger.observe(messageID: "m1", keys: [tiny], now: now).isEmpty)
    }

    @Test func aLiveEventStampsOnlyTheNewSticker() {
        var ledger = FreshReactionLedger()
        _ = ledger.observe(messageID: "m1", keys: [mine], now: now)
        ledger.noteLive(messageID: "m1", eventAt: now, now: now)

        let fresh = ledger.observe(messageID: "m1", keys: [mine, tiny], now: now.addingTimeInterval(0.2))
        #expect(fresh == [tiny])
        // Rendering the same pile again does not replay it.
        #expect(ledger.observe(messageID: "m1", keys: [mine, tiny], now: now.addingTimeInterval(0.4)).isEmpty)
    }

    @Test func aChangeWithoutALiveEventRendersAtRest() {
        var ledger = FreshReactionLedger()
        _ = ledger.observe(messageID: "m1", keys: [], now: now)

        // A reconnect or foreground refresh brings the reaction in with no event.
        #expect(ledger.observe(messageID: "m1", keys: [tiny], now: now).isEmpty)
    }

    @Test func aReplayedOldEventIsHistory() {
        var ledger = FreshReactionLedger()
        _ = ledger.observe(messageID: "m1", keys: [], now: now)
        ledger.noteLive(messageID: "m1", eventAt: now.addingTimeInterval(-60), now: now)

        #expect(ledger.observe(messageID: "m1", keys: [tiny], now: now).isEmpty)
    }

    @Test func theLiveWindowCloses() {
        var ledger = FreshReactionLedger()
        _ = ledger.observe(messageID: "m1", keys: [], now: now)
        ledger.noteLive(messageID: "m1", eventAt: now, now: now)

        let late = now.addingTimeInterval(FreshReactionLedger.liveWindow + 1)
        #expect(ledger.observe(messageID: "m1", keys: [tiny], now: late).isEmpty)
    }

    @Test func theViewersOwnAddStampsAtOnceAndOnlyOnce() {
        var ledger = FreshReactionLedger()
        _ = ledger.observe(messageID: "m1", keys: [tiny], now: now)
        ledger.addPending(messageID: "m1", emoji: "❤️", now: now)

        #expect(ledger.pending(messageID: "m1", now: now) == ["❤️"])
        #expect(ledger.observe(messageID: "m1", keys: [tiny, mine], now: now) == [mine])

        // The Server's copy arrives under the same key: nothing new to stamp.
        let dropped = ledger.dropPending(messageID: "m1", emoji: "❤️")
        #expect(dropped)
        #expect(ledger.observe(messageID: "m1", keys: [tiny, mine], now: now).isEmpty)
        #expect(ledger.pending(messageID: "m1", now: now).isEmpty)
    }

    @Test func anUnconfirmedAddExpires() {
        var ledger = FreshReactionLedger()
        ledger.addPending(messageID: "m1", emoji: "❤️", now: now)

        let later = now.addingTimeInterval(FreshReactionLedger.pendingTTL + 1)
        #expect(ledger.pending(messageID: "m1", now: later).isEmpty)
    }

    @Test func simultaneousArrivalsStaggerInPileOrder() {
        let landing = ReactionStampSchedule.delays(
            pileOrder: ["a", "b", "c", "d"],
            fresh: ["d", "b", "overflowed"]
        )

        #expect(landing.map(\.key) == ["b", "d"])
        #expect(landing.map(\.delay) == [0, 0.3])
    }
}
