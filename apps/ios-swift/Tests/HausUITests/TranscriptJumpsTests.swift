@testable import HausUI
import Testing

/// When the latest and first-unread jumps are offered.
struct TranscriptJumpsTests {
    private let loaded = ["m1", "m2", "m3", "m4", "m5", "m6"]

    @Test func theLatestJumpShowsAwayFromTheNewestOrWithNewerHistory() {
        let none = TranscriptUnreadJump(messageID: nil)
        #expect(!TranscriptJumps(isNearNewest: true, hasNewer: false, unread: none).showsLatest)
        #expect(TranscriptJumps(isNearNewest: false, hasNewer: false, unread: none).showsLatest)
        #expect(TranscriptJumps(isNearNewest: true, hasNewer: true, unread: none).showsLatest)
    }

    @Test func anUnreadMessageAboveTheViewportOffersTheJump() {
        let unread = TranscriptUnreadJump(messageID: "m2")
            .observing(visibleIDs: ["m6", "m5", "m4"], loadedIDs: loaded)
        #expect(unread.offersJump)
        #expect(TranscriptJumps(isNearNewest: true, hasNewer: false, unread: unread).showsUnread)
    }

    @Test func anUnreadMessageNotLoadedYetOffersTheJump() {
        let unread = TranscriptUnreadJump(messageID: "m0")
            .observing(visibleIDs: ["m6", "m5"], loadedIDs: loaded)
        #expect(unread.offersJump)
    }

    @Test func anUnreadMessageBelowTheViewportOffersNoJump() {
        let unread = TranscriptUnreadJump(messageID: "m6")
            .observing(visibleIDs: ["m3", "m2"], loadedIDs: loaded)
        #expect(!unread.offersJump)
    }

    @Test func seeingTheUnreadMessageSpendsTheJumpForGood() {
        let seen = TranscriptUnreadJump(messageID: "m2")
            .observing(visibleIDs: ["m3", "m2"], loadedIDs: loaded)
            .observing(visibleIDs: ["m6", "m5"], loadedIDs: loaded)
        #expect(!seen.offersJump)
    }

    @Test func takingTheJumpSpendsIt() {
        let taken = TranscriptUnreadJump(messageID: "m2")
            .observing(visibleIDs: ["m6", "m5"], loadedIDs: loaded)
            .spent()
        #expect(!taken.offersJump)
    }

    @Test func anUnsettledViewportChangesNothing() {
        let unread = TranscriptUnreadJump(messageID: "m2")
        #expect(unread.observing(visibleIDs: [], loadedIDs: loaded) == unread)
        #expect(!unread.offersJump)
    }
}
