import Foundation
import XCTest
@testable import HausModels

/// A label update against tail reads in flight (specs/realtime-events.md,
/// label recovery).
final class TranscriptLabelRecoveryTests: XCTestCase {
    private typealias F = TranscriptFixture
    private let chat = TranscriptKey.chat("chat_1")

    /// Regression: a tail read begun before a rename returns a message the
    /// cache has never seen, under the former label. No carrier refresh names
    /// it, so if it landed nothing would repair it. The update retires the
    /// held tail, and the list reads its tail afresh.
    func testATailHeldAcrossALabelUpdateCannotLandTheFormerLabel() throws {
        var store = TranscriptStore()
        var reads = TranscriptReads()
        store.write(
            F.page([F.message("m1", sequence: 1, labelID: "label_1", labelName: "Old")]),
            to: chat, as: .refresh(followingLatest: true)
        )

        // m2 commits; its tail read starts and is held.
        reads.noteTail(chat, through: 2)
        let through = try XCTUnwrap(reads.takeTail(chat))
        XCTAssertEqual(TranscriptReads.tailPlan(for: store.lists[chat], through: through), .read(afterSequence: 1))
        let heldEpoch = reads.tailEpoch
        reads.beginListRead(chatID: "chat_1")

        // The label is renamed: tails retire, then carriers refresh.
        reads.invalidateTails()
        XCTAssertEqual(store.refreshes(carryingLabel: "label_1"), [EntityRefresh(chatID: "chat_1", messageID: "m1")])
        store.setEntity(ChatMessageEntity(
            message: F.message("m1", sequence: 1, labelID: "label_1", labelName: "New"), thread: nil
        ))

        // The held tail answers with the former label: it writes nothing and
        // asks for the tail again.
        let held = F.page([F.message("m2", sequence: 2, labelID: "label_1", labelName: "Old")])
        if reads.acceptsTail(chat, through: through, epoch: heldEpoch) {
            store.write(held, to: chat, as: .tail)
        }
        _ = reads.finishListRead(chatID: "chat_1")
        XCTAssertNil(store.entities["m2"])

        // The fresh tail reads the current label.
        let again = try XCTUnwrap(reads.takeTail(chat))
        XCTAssertEqual(again, 2)
        let fresh = F.page([F.message("m2", sequence: 2, labelID: "label_1", labelName: "New")])
        XCTAssertTrue(reads.acceptsTail(chat, through: again, epoch: reads.tailEpoch))
        store.write(fresh, to: chat, as: .tail)

        XCTAssertEqual(store.lists[chat]?.messageIDs, ["m1", "m2"])
        for id in ["m1", "m2"] {
            XCTAssertEqual(store.entities[id]?.message.task?.labels.first?.name, "New", id)
        }
    }

    func testATailBegunAfterTheUpdateLandsNormally() {
        var reads = TranscriptReads()
        reads.invalidateTails()
        let epoch = reads.tailEpoch

        XCTAssertTrue(reads.acceptsTail(chat, through: 4, epoch: epoch))
        XCTAssertNil(reads.takeTail(chat), "an accepted tail asks for nothing more")
    }

    /// A Server change retires tails in flight too, and never rewinds the
    /// epoch to one an older read still holds.
    func testAResetRetiresEveryTailInFlight() {
        var reads = TranscriptReads()
        let held = reads.tailEpoch
        reads.noteTail(chat, through: 3)
        reads.reset()

        XCTAssertNil(reads.takeTail(chat))
        XCTAssertNotEqual(reads.tailEpoch, held)
    }
}
