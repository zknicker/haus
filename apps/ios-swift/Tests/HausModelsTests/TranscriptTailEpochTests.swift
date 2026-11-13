import Foundation
import XCTest
@testable import HausModels

/// A Server change against tail reads in flight.
final class TranscriptTailEpochTests: XCTestCase {
    private let chat = TranscriptKey.chat("chat_1")

    func testATailBegunAfterAResetLandsNormally() {
        var reads = TranscriptReads()
        reads.reset()
        let epoch = reads.tailEpoch

        XCTAssertTrue(reads.acceptsTail(chat, through: 4, epoch: epoch))
        XCTAssertNil(reads.takeTail(chat), "an accepted tail asks for nothing more")
    }

    /// A Server change retires tails in flight, and never rewinds the epoch to
    /// one an older read still holds.
    func testAResetRetiresEveryTailInFlight() {
        var reads = TranscriptReads()
        let held = reads.tailEpoch
        reads.noteTail(chat, through: 3)
        reads.reset()

        XCTAssertNil(reads.takeTail(chat))
        XCTAssertNotEqual(reads.tailEpoch, held)
    }

    func testARetiredTailWritesNothingAndAsksForItsTailAgain() {
        var reads = TranscriptReads()
        let held = reads.tailEpoch
        reads.reset()

        XCTAssertFalse(reads.acceptsTail(chat, through: 3, epoch: held))
        XCTAssertEqual(reads.takeTail(chat), 3)
    }
}
