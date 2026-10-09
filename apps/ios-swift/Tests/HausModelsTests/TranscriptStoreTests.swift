import Foundation
import XCTest
@testable import HausModels

final class TranscriptStoreTests: XCTestCase {
    private typealias F = TranscriptFixture
    private let chat = TranscriptKey.chat("chat_1")

    func testAPageSeedsOneEntityPerMessageAndRendersBack() {
        var store = TranscriptStore()
        let page = F.page(F.messages(1...3), threads: [F.thread(anchor: "m2")])

        XCTAssertEqual(store.write(page, to: chat, as: .refresh(followingLatest: true)), [chat])

        XCTAssertEqual(store.lists[chat]?.messageIDs, ["m1", "m2", "m3"])
        XCTAssertEqual(store.entities["m2"]?.thread?.anchorMessageID, "m2")
        XCTAssertNil(store.entities["m1"]?.thread)
        XCTAssertEqual(store.page(chat), page)
    }

    func testATailReadAppendsDedupedInSequenceOrder() {
        var store = TranscriptStore()
        store.write(F.page(F.messages(1...3)), to: chat, as: .refresh(followingLatest: true))

        // A duplicate or late event re-reads an overlap; ids never repeat.
        store.write(F.page(F.messages(3...5)), to: chat, as: .tail)
        store.write(F.page(F.messages(4...5)), to: chat, as: .tail)

        XCTAssertEqual(store.lists[chat]?.messageIDs, ["m1", "m2", "m3", "m4", "m5"])
        XCTAssertEqual(store.lists[chat]?.scannedThroughSequence, 5)
    }

    func testATailReadFillsTheGapAMissedEventLeft() throws {
        var store = TranscriptStore()
        store.write(F.page(F.messages(1...2)), to: chat, as: .refresh(followingLatest: true))

        // The event for 3 was missed; the event for 4 resumes after the last scan.
        let plan = TranscriptReads.tailPlan(for: store.lists[chat], through: 4)
        XCTAssertEqual(plan, .read(afterSequence: 2))
        store.write(F.page(F.messages(3...4)), to: chat, as: .tail)

        XCTAssertEqual(store.lists[chat]?.messageIDs, ["m1", "m2", "m3", "m4"])
        XCTAssertEqual(TranscriptReads.tailPlan(for: store.lists[chat], through: 4), .skip)
    }

    func testAFilteredListResumesAfterItsLastScanNotItsLastMatch() {
        var store = TranscriptStore()
        let chain = TranscriptKey.inlineReplies(chatID: "chat_1", rootMessageID: "m1")
        let replies = [F.message("m1", sequence: 1), F.message("r4", sequence: 4)]
        store.write(F.page(replies, scannedThrough: 9), to: chain, as: .refresh(followingLatest: false))

        XCTAssertEqual(TranscriptReads.tailPlan(for: store.lists[chain], through: 12), .read(afterSequence: 9))

        // The tail scanned to 15 and matched nothing new.
        store.write(F.page([], scannedThrough: 15), to: chain, as: .tail)
        XCTAssertEqual(store.lists[chain]?.messageIDs, ["m1", "r4"])
        XCTAssertEqual(store.lists[chain]?.scannedThroughSequence, 15)
        XCTAssertEqual(TranscriptReads.tailPlan(for: store.lists[chain], through: 12), .skip)
    }

    func testAListBrowsingHistoryNeverTailReads() {
        var store = TranscriptStore()
        store.write(F.page(F.messages(10...12), nextBefore: 10, nextAfter: 12), to: chat, as: .replace)

        XCTAssertEqual(TranscriptReads.tailPlan(for: store.lists[chat], through: 40), .skip)
        XCTAssertEqual(TranscriptReads.tailPlan(for: nil, through: 40), .skip)
    }

    func testOneEntityReadUpdatesEveryListThatShowsTheMessage() {
        var store = TranscriptStore()
        let chain = TranscriptKey.inlineReplies(chatID: "chat_1", rootMessageID: "m1")
        store.write(F.page(F.messages(1...3)), to: chat, as: .refresh(followingLatest: true))
        store.write(F.page([F.message("m1", sequence: 1), F.message("m3", sequence: 3)]), to: chain, as: .replace)

        let changed = store.setEntity(ChatMessageEntity(message: F.message("m3", sequence: 3, reaction: "👍"), thread: nil))

        XCTAssertEqual(changed, [chat, chain])
        XCTAssertEqual(store.page(chat)?.messages.last?.reactions.first?.emoji, "👍")
        XCTAssertEqual(store.page(chain)?.messages.last?.reactions.first?.emoji, "👍")
        // An unchanged answer touches nothing.
        XCTAssertEqual(store.setEntity(ChatMessageEntity(message: F.message("m3", sequence: 3, reaction: "👍"), thread: nil)), [])
    }

    func testAnEntityNoListNamesIsNotKept() {
        var store = TranscriptStore()
        XCTAssertEqual(store.setEntity(ChatMessageEntity(message: F.message("m9", sequence: 9), thread: nil)), [])
        XCTAssertNil(store.entities["m9"])
    }

    /// A missed Thread reply heals through the bulk reload: the reseeded page
    /// carries the anchor's new summary, and the list's ids and paging stay.
    func testAReseedRewritesTheParentAnchorSummaryAndKeepsPaging() {
        var store = TranscriptStore()
        store.write(F.page(F.messages(1...3), nextBefore: 1, threads: [F.thread(anchor: "m2", replyCount: 1)]),
                    to: chat, as: .refresh(followingLatest: true))

        let changed = store.write(
            F.page(F.messages(2...3), nextAfter: 3, threads: [F.thread(anchor: "m2", replyCount: 2, unreadCount: 1)]),
            to: chat, as: .reseed
        )

        XCTAssertEqual(changed, [chat])
        XCTAssertEqual(store.entities["m2"]?.thread?.replyCount, 2)
        XCTAssertEqual(store.lists[chat]?.messageIDs, ["m1", "m2", "m3"])
        XCTAssertEqual(store.lists[chat]?.nextBeforeSequence, 1)
        XCTAssertNil(store.lists[chat]?.nextAfterSequence)
    }

    func testRemovingAListDropsOnlyEntitiesNoOtherListNames() {
        var store = TranscriptStore()
        let other = TranscriptKey.chat("chat_2")
        let chain = TranscriptKey.inlineReplies(chatID: "chat_1", rootMessageID: "m1")
        store.write(F.page(F.messages(1...2)), to: chat, as: .replace)
        store.write(F.page([F.message("m1", sequence: 1)]), to: chain, as: .replace)
        store.write(F.page([F.message("x1", sequence: 1, chatID: "chat_2")]), to: other, as: .replace)

        XCTAssertEqual(store.removeLists { $0 == self.chat }, [chat])

        XCTAssertNotNil(store.entities["m1"], "the inline chain still names it")
        XCTAssertNil(store.entities["m2"])
        XCTAssertNotNil(store.entities["x1"])
        store.removeLists { $0.chatID == "chat_1" }
        XCTAssertNil(store.entities["m1"])
        XCTAssertEqual(Array(store.lists.keys), [other])
    }

    func testOlderPagesNeverMoveTheScanPosition() {
        var store = TranscriptStore()
        store.write(F.page(F.messages(51...60), nextBefore: 51), to: chat, as: .refresh(followingLatest: true))
        store.write(F.page(F.messages(41...50), nextBefore: 41), to: chat, as: .older)

        XCTAssertEqual(store.lists[chat]?.messageIDs.first, "m41")
        XCTAssertEqual(store.lists[chat]?.scannedThroughSequence, 60)
    }

    func testLabelScanFindsOnlyEntitiesCarryingTheLabel() {
        var store = TranscriptStore()
        store.write(F.page([
            F.message("m1", sequence: 1, labelID: "label_1"),
            F.message("m2", sequence: 2, labelID: "label_2"),
            F.message("m3", sequence: 3),
        ]), to: chat, as: .replace)

        XCTAssertEqual(store.refreshes(carryingLabel: "label_1"), [EntityRefresh(chatID: "chat_1", messageID: "m1")])
    }
}

/// The tail bits and dirty sets (specs/realtime-events.md race cases).
final class TranscriptReadsTests: XCTestCase {
    private let chat = TranscriptKey.chat("chat_1")

    /// Held initial read: events arriving while a list's first read is in
    /// flight set one bit, and exactly one tail read drains it.
    func testEventsDuringAHeldReadLeaveOneTailRead() {
        var reads = TranscriptReads()
        reads.noteTail(chat, through: 7)
        reads.noteTail(chat, through: 9)
        reads.noteTail(chat, through: 8)

        XCTAssertEqual(reads.takeTail(chat), 9)
        XCTAssertNil(reads.takeTail(chat))
    }

    /// Absent entity: a reaction for a message no list has seeded yet lands
    /// while the list read is in flight; the read seeds, then the id is read
    /// again.
    func testAReactionDuringAListReadIsReadAgainWhenTheListSettles() {
        var reads = TranscriptReads()
        reads.beginListRead(chatID: "chat_1")
        reads.markDirty(EntityRefresh(chatID: "chat_1", messageID: "m1"))

        XCTAssertEqual(reads.finishListRead(chatID: "chat_1"), ["m1"])
        XCTAssertEqual(reads.finishListRead(chatID: "chat_1"), [], "the set cleared with the last read")
    }

    /// Overlapping list reads: the dirty set survives the first settle and
    /// clears only after the second, whichever order they settle in.
    func testTheDirtySetClearsOnlyWhenTheLastListReadSettles() {
        var reads = TranscriptReads()
        reads.beginListRead(chatID: "chat_1")
        reads.beginListRead(chatID: "chat_1")
        reads.markDirty(EntityRefresh(chatID: "chat_1", messageID: "m1"))

        XCTAssertEqual(reads.finishListRead(chatID: "chat_1"), ["m1"])
        XCTAssertEqual(reads.finishListRead(chatID: "chat_1"), ["m1"])
        reads.beginListRead(chatID: "chat_1")
        XCTAssertEqual(reads.finishListRead(chatID: "chat_1"), [])
    }

    func testWithNoListReadInFlightNothingIsDirty() {
        var reads = TranscriptReads()
        reads.markDirty(EntityRefresh(chatID: "chat_1", messageID: "m1"))
        reads.beginListRead(chatID: "chat_1")
        XCTAssertEqual(reads.finishListRead(chatID: "chat_1"), [])
    }

    func testAPurgedChatKeepsNoBitsOrDirtyIDs() {
        var reads = TranscriptReads()
        reads.noteTail(chat, through: 3)
        reads.noteTail(.chat("chat_2"), through: 3)
        reads.beginListRead(chatID: "chat_1")
        reads.markDirty(EntityRefresh(chatID: "chat_1", messageID: "m1"))

        reads.purge(chatID: "chat_1")

        XCTAssertNil(reads.takeTail(chat))
        XCTAssertEqual(reads.takeTail(.chat("chat_2")), 3)
        XCTAssertEqual(reads.finishListRead(chatID: "chat_1"), [])
    }
}
