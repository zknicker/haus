import Foundation
import HausModels
import Testing

/// The phone's read rule is the web App's: `chat.markRead` fires for the
/// highest sequence actually on screen, only while the app is frontmost, never
/// backwards, once per `(chat, sequence)`, and again after a failure.
@Suite("Chat read ledger")
struct ChatReadLedgerTests {
    private let chat = ChatReadScope(serverID: "srv_main", chatID: "chat_all")
    private let other = ChatReadScope(serverID: "srv_main", chatID: "chat_product")

    @Test("The highest visible sequence is the one selected, ignoring rows with none")
    func highestVisibleSequence() {
        let sequences = ["m1": 4, "m2": 9, "m3": 7]

        #expect(ChatReadVisibility.highestVisibleSequence(
            visibleMessageIDs: ["m3", "m1", "m2"],
            sequenceByMessageID: sequences
        ) == 9)
        // A Thread's anchor, its task metadata, and an optimistic send are rows
        // the loaded page cannot name.
        #expect(ChatReadVisibility.highestVisibleSequence(
            visibleMessageIDs: ["thread-anchor-m9", "m1", "thread-pending-send"],
            sequenceByMessageID: sequences
        ) == 4)
        #expect(ChatReadVisibility.highestVisibleSequence(
            visibleMessageIDs: ["thread-anchor-m9"],
            sequenceByMessageID: sequences
        ) == nil)
        #expect(ChatReadVisibility.highestVisibleSequence(
            visibleMessageIDs: [],
            sequenceByMessageID: sequences
        ) == nil)
    }

    @Test("Loaded-but-unseen history never acknowledges")
    func onlyVisibleRowsAcknowledge() {
        var ledger = ChatReadLedger()

        #expect(ledger.pendingAcknowledgement(chat, foregrounded: true) == nil)

        // The page holds sequences up to 12; the viewport is showing 3.
        ledger.observeVisible(chat, sequence: 3)

        #expect(ledger.pendingAcknowledgement(chat, foregrounded: true)?.sequence == 3)
    }

    @Test("The visible mark never regresses")
    func visibleMarkNeverRegresses() throws {
        var ledger = ChatReadLedger()

        ledger.observeVisible(chat, sequence: 12)
        let lowered = ledger.observeVisible(chat, sequence: 4)
        #expect(lowered == 12)
        #expect(ledger.visibleHighWater(chat) == 12)

        let request = try #require(ledger.pendingAcknowledgement(chat, foregrounded: true))
        #expect(request.sequence == 12)
        let claimedRequest = ledger.begin(request)
        #expect(claimedRequest)
        ledger.succeed(request, sequence: 12)

        // Scrolling back into history shows older rows. It does not un-read
        // newer ones, and it must never send a lower sequence to Server.
        ledger.observeVisible(chat, sequence: 5)
        #expect(ledger.pendingAcknowledgement(chat, foregrounded: true) == nil)
        #expect(ledger.acknowledged(chat) == 12)
    }

    @Test("A backgrounded app acknowledges nothing, and re-evaluates on return")
    func foregroundGate() {
        var ledger = ChatReadLedger()
        ledger.observeVisible(chat, sequence: 7)

        #expect(ledger.pendingAcknowledgement(chat, foregrounded: false) == nil)
        #expect(ledger.pendingAcknowledgement(chat, foregrounded: true)?.sequence == 7)
    }

    @Test("One acknowledgement per chat is in flight, whatever the scroll does")
    func dedupesInFlightAttempts() throws {
        var ledger = ChatReadLedger()
        ledger.observeVisible(chat, sequence: 7)

        let request = try #require(ledger.pendingAcknowledgement(chat, foregrounded: true))
        let claimedRequest = ledger.begin(request)
        #expect(claimedRequest)
        #expect(ledger.pendingAcknowledgement(chat, foregrounded: true) == nil)
        let refusedRequest = ledger.begin(request)
        #expect(!refusedRequest)

        // A flick keeps raising the mark while that first mutation is in
        // flight. None of those raises is worth its own write.
        ledger.observeVisible(chat, sequence: 9)
        ledger.observeVisible(chat, sequence: 14)
        #expect(ledger.pendingAcknowledgement(chat, foregrounded: true) == nil)

        // The receipt is what releases the Chat, and the mark it comes to rest
        // on is the one that follows.
        ledger.succeed(request, sequence: 7)
        #expect(ledger.pendingAcknowledgement(chat, foregrounded: true)?.sequence == 14)

        // Another Chat is a separate scope and is unaffected.
        ledger.observeVisible(other, sequence: 2)
        #expect(ledger.pendingAcknowledgement(other, foregrounded: true)?.sequence == 2)
    }

    @Test("A failed acknowledgement retries at the next trigger")
    func retriesAfterFailure() throws {
        var ledger = ChatReadLedger()
        ledger.observeVisible(chat, sequence: 7)

        let request = try #require(ledger.pendingAcknowledgement(chat, foregrounded: true))
        let claimedRequest = ledger.begin(request)
        #expect(claimedRequest)
        ledger.fail(request)

        #expect(ledger.acknowledged(chat) == nil)
        let retry = try #require(ledger.pendingAcknowledgement(chat, foregrounded: true))
        #expect(retry == request)
        let claimedRetry = ledger.begin(retry)
        #expect(claimedRetry)
        ledger.succeed(retry, sequence: 7)
        #expect(ledger.acknowledged(chat) == 7)
        #expect(ledger.pendingAcknowledgement(chat, foregrounded: true) == nil)
    }

    @Test("A receipt ahead of the request is what gets recorded")
    func receiptSequenceIsAuthoritative() throws {
        var ledger = ChatReadLedger()
        ledger.observeVisible(chat, sequence: 7)

        let request = try #require(ledger.pendingAcknowledgement(chat, foregrounded: true))
        let claimedRequest = ledger.begin(request)
        #expect(claimedRequest)
        // Another client had already read further.
        ledger.succeed(request, sequence: 20)

        ledger.observeVisible(chat, sequence: 15)
        #expect(ledger.pendingAcknowledgement(chat, foregrounded: true) == nil)
        #expect(ledger.acknowledged(chat) == 20)
    }
}
