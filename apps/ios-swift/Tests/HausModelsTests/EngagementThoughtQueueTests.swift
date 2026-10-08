import Foundation
import XCTest
@testable import HausModels

final class EngagementThoughtQueueTests: XCTestCase {
    private typealias Queue = EngagementThoughtQueue

    func testTheFirstThoughtShowsAtOnceAndLeavesAfterItsDwell() {
        var queue = Queue()
        queue.receive(thought(1, agent: "blippy", "Reading the drawer code"), now: 10)
        XCTAssertEqual(queue.current?.thought.id, 1)
        XCTAssertEqual(queue.nextWake, 10 + Queue.dwell)

        queue.advance(now: 10 + Queue.dwell - 0.01)
        XCTAssertEqual(queue.current?.thought.id, 1)
        queue.advance(now: 10 + Queue.dwell)
        XCTAssertNil(queue.current)
        XCTAssertNil(queue.nextWake)
    }

    func testConcurrentThoughtsQueueAndNeverOverlap() {
        var queue = Queue()
        queue.receive(thought(1, agent: "blippy", "Reading the drawer code"), now: 0)
        queue.receive(thought(2, agent: "tiny", "Checking the forecast"), now: 0.2)

        XCTAssertEqual(queue.current?.thought.id, 1)
        XCTAssertEqual(queue.pending.map(\.id), [2])
        // A waiting bubble cuts the one up to its minimum dwell, then the exit gap runs.
        XCTAssertEqual(queue.nextWake, Queue.minimumDwell)
        queue.advance(now: Queue.minimumDwell)
        XCTAssertNil(queue.current)
        XCTAssertEqual(queue.nextWake, Queue.minimumDwell + Queue.gap)

        queue.advance(now: Queue.minimumDwell + Queue.gap - 0.01)
        XCTAssertNil(queue.current)
        queue.advance(now: Queue.minimumDwell + Queue.gap)
        XCTAssertEqual(queue.current?.thought.id, 2)
        XCTAssertTrue(queue.pending.isEmpty)
    }

    func testABubbleHoldsItsMinimumDwellHoweverManyWait() {
        var queue = Queue()
        queue.receive(thought(1, agent: "blippy", "One"), now: 0)
        queue.receive(thought(2, agent: "tiny", "Two"), now: 0.1)
        queue.receive(thought(3, agent: "juniper", "Three"), now: 0.2)

        queue.advance(now: Queue.minimumDwell - 0.01)
        XCTAssertEqual(queue.current?.thought.id, 1)
    }

    func testOnlyAnAgentsLatestWaitingThoughtIsKeptInItsPlace() {
        var queue = Queue()
        queue.receive(thought(1, agent: "blippy", "Reading"), now: 0)
        queue.receive(thought(2, agent: "tiny", "Checking the forecast"), now: 0.1)
        queue.receive(thought(3, agent: "juniper", "Opening the logs"), now: 0.2)
        queue.receive(thought(4, agent: "tiny", "Found rain on Saturday"), now: 0.3)
        queue.receive(thought(5, agent: "blippy", "Found a timing race"), now: 0.4)

        XCTAssertEqual(queue.current?.thought.id, 1)
        // Tiny's newer line replaced its older one without losing the turn;
        // Blippy's next line waits behind everyone else.
        XCTAssertEqual(queue.pending.map(\.id), [4, 3, 5])
    }

    func testTheSameWordsAsTheBubbleUpAddNothing() {
        var queue = Queue()
        queue.receive(thought(1, agent: "blippy", "Reading the drawer code"), now: 0)
        queue.receive(thought(2, agent: "blippy", "reading the drawer code."), now: 0.5)

        XCTAssertEqual(queue.current?.thought.id, 1)
        XCTAssertTrue(queue.pending.isEmpty)
        XCTAssertEqual(queue.nextWake, Queue.dwell)
    }

    func testAnAgentThatLeavesTakesItsWaitingThoughtAndBubble() {
        var queue = Queue()
        queue.receive(thought(1, agent: "blippy", "Reading"), now: 0)
        queue.receive(thought(2, agent: "tiny", "Checking the forecast"), now: 0.1)
        queue.receive(thought(3, agent: "juniper", "Opening the logs"), now: 0.2)

        queue.retain(engaged: { agent, _ in agent != "tiny" }, held: none, now: 0.5)
        XCTAssertEqual(queue.current?.thought.id, 1)
        XCTAssertEqual(queue.pending.map(\.id), [3])

        queue.retain(engaged: { agent, _ in agent == "juniper" }, held: none, now: 0.6)
        XCTAssertNil(queue.current)
        // The next bubble still waits out the leaving one's exit.
        queue.advance(now: 0.6 + Queue.gap)
        XCTAssertEqual(queue.current?.thought.id, 3)
    }

    func testADoneReplyKeepsItsBubbleUpButDropsWhatWaits() {
        var queue = Queue()
        queue.receive(thought(1, agent: "blippy", "Writing the fix", run: "run_b"), now: 0)
        queue.receive(thought(2, agent: "blippy", "Running the tests", run: "run_b"), now: 0.2)
        queue.receive(thought(3, agent: "tiny", "Checking the forecast", run: "run_t"), now: 0.3)

        // Blippy's `--done` reply is on its way: no longer engaging, but held.
        let held: (String, String) -> Bool = { _, run in run == "run_b" }
        queue.retain(engaged: { _, run in run == "run_t" }, held: held, now: 0.4)
        XCTAssertEqual(queue.current?.thought.id, 1)
        XCTAssertEqual(queue.pending.map(\.id), [3])

        // The reply lands and the hold releases: the bubble goes with it.
        queue.retain(engaged: { _, run in run == "run_t" }, held: none, now: 0.8)
        XCTAssertNil(queue.current)
        queue.advance(now: 0.8 + Queue.gap)
        XCTAssertEqual(queue.current?.thought.id, 3)
    }

    func testANormalizedLineIgnoresCasePunctuationAndSpacing() {
        XCTAssertEqual(ChatTypingThought.normalized("  Still   checking, the BUILD!  "), "still checking the build")
    }

    // MARK: - Helpers

    private let none: (String, String) -> Bool = { _, _ in false }

    private func thought(_ id: Int, agent: String, _ text: String, run: String? = nil) -> ChatTypingThought {
        ChatTypingThought(id: id, agentID: agent, runID: run ?? "run_\(agent)", text: text)
    }
}
