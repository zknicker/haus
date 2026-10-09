import Foundation
import XCTest
@testable import HausModels

final class ChatEventCoalescerTests: XCTestCase {
    func testFirstEventOpensAWindowAndLaterEventsJoinIt() {
        var coalescer = ChatEventCoalescer<ChatRealtimeEvent>()

        XCTAssertEqual(coalescer.buffer(event(sequence: 1)), .scheduleFlush)
        XCTAssertEqual(coalescer.buffer(event(sequence: 2)), .awaitScheduledFlush)
        XCTAssertEqual(coalescer.buffer(event(sequence: 3)), .awaitScheduledFlush)
        XCTAssertEqual(coalescer.count, 3)
    }

    func testDrainReturnsTheBatchInArrivalOrderAndEmptiesTheBuffer() {
        var coalescer = ChatEventCoalescer<ChatRealtimeEvent>()
        _ = coalescer.buffer(event(sequence: 1))
        _ = coalescer.buffer(event(sequence: 2))

        XCTAssertEqual(coalescer.drain(), [event(sequence: 1), event(sequence: 2)])
        XCTAssertTrue(coalescer.isEmpty)
        XCTAssertEqual(coalescer.drain(), [])
    }

    func testDrainingClosesTheWindowSoTheNextEventSchedulesAgain() {
        var coalescer = ChatEventCoalescer<ChatRealtimeEvent>()
        _ = coalescer.buffer(event(sequence: 1))
        _ = coalescer.drain()

        XCTAssertEqual(coalescer.buffer(event(sequence: 2)), .scheduleFlush)
    }

    func testReachingTheBatchLimitFlushesWithoutWaitingForTheWindow() {
        var coalescer = ChatEventCoalescer<ChatRealtimeEvent>(batchLimit: 3)

        XCTAssertEqual(coalescer.buffer(event(sequence: 1)), .scheduleFlush)
        XCTAssertEqual(coalescer.buffer(event(sequence: 2)), .awaitScheduledFlush)
        XCTAssertEqual(coalescer.buffer(event(sequence: 3)), .flushNow)
        XCTAssertEqual(coalescer.drain().count, 3)
        // The limited flush closed the window, so the next burst reschedules.
        XCTAssertEqual(coalescer.buffer(event(sequence: 4)), .scheduleFlush)
    }

    func testABatchLimitOfOneNeverBuffers() {
        var coalescer = ChatEventCoalescer<ChatRealtimeEvent>(batchLimit: 1)

        XCTAssertEqual(coalescer.buffer(event(sequence: 1)), .flushNow)
        XCTAssertEqual(coalescer.drain(), [event(sequence: 1)])
        XCTAssertEqual(coalescer.buffer(event(sequence: 2)), .flushNow)
    }

    func testAnInvalidBatchLimitIsClampedRatherThanTrapping() {
        var coalescer = ChatEventCoalescer<ChatRealtimeEvent>(batchLimit: 0)

        XCTAssertEqual(coalescer.batchLimit, 1)
        XCTAssertEqual(coalescer.buffer(event(sequence: 1)), .flushNow)
    }

    private func event(sequence: Int) -> ChatRealtimeEvent {
        .messageCreated(MessageCreatedEvent(
            serverID: "server_1",
            chatID: "chat_1",
            messageID: "message_\(sequence)",
            sequence: sequence
        ))
    }
}
