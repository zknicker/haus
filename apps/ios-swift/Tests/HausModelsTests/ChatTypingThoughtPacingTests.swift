import Foundation
import XCTest
@testable import HausModels

final class ChatTypingThoughtPacingTests: XCTestCase {
    func testHoldGrowsWithTheLineBetweenItsBounds() {
        XCTAssertEqual(ChatTypingThoughtPacing.hold(for: "Reading"), 5)
        XCTAssertEqual(
            ChatTypingThoughtPacing.hold(for: "Checking whether the weekend forecast still looks wet"),
            6.3,
            accuracy: 0.001
        )
        XCTAssertEqual(ChatTypingThoughtPacing.hold(for: String(repeating: "word ", count: 40)), 7.5)
    }

    func testANewLineShows() {
        let onScreen = screen(text: "Reading the notes", shownAt: 0, hideAt: 6)
        XCTAssertEqual(arrival("Drafting the reply", onScreen: onScreen, now: 1), .show)
        XCTAssertEqual(arrival("Reading the notes", onScreen: nil, now: 1), .show)
        XCTAssertEqual(arrival("Reading the notes", run: "run_2", onScreen: onScreen, now: 1), .show)
    }

    func testTheSameLineExtendsUpToTheVisibleCap() {
        let onScreen = screen(text: "Reading the notes", shownAt: 0, hideAt: 6)
        // Case and punctuation do not make a line new.
        XCTAssertEqual(arrival("reading the notes…", onScreen: onScreen, now: 3), .extend(hideAt: 8))
        XCTAssertEqual(arrival("Reading the notes", onScreen: onScreen, now: 10), .extend(hideAt: 12))
        let capped = screen(text: "Reading the notes", shownAt: 0, hideAt: 12)
        XCTAssertEqual(arrival("Reading the notes", onScreen: capped, now: 11), .absorb)
    }

    func testLinesWaitTheirSpacingExceptAnEngagementsFirst() {
        XCTAssertEqual(ChatTypingThoughtPacing.delay(lastShownAt: nil, now: 3, firstOfEngagement: false), 0)
        XCTAssertEqual(ChatTypingThoughtPacing.delay(lastShownAt: 1, now: 3, firstOfEngagement: false), 3)
        XCTAssertEqual(ChatTypingThoughtPacing.delay(lastShownAt: 1, now: 3, firstOfEngagement: true), 0)
        XCTAssertEqual(ChatTypingThoughtPacing.delay(lastShownAt: 1, now: 9, firstOfEngagement: false), 0)
    }

    func testNormalizationIgnoresCasePunctuationAndSpacing() {
        XCTAssertEqual(ChatTypingThoughtPacing.normalized("  Still   checking, the BUILD!  "), "still checking the build")
    }

    private func screen(text: String, shownAt: TimeInterval, hideAt: TimeInterval) -> ChatTypingThoughtOnScreen {
        ChatTypingThoughtOnScreen(
            thought: ChatTypingThought(id: 1, agentID: "agent_1", runID: "run_1", text: text),
            shownAt: shownAt,
            hideAt: hideAt
        )
    }

    private func arrival(
        _ text: String,
        run: String = "run_1",
        onScreen: ChatTypingThoughtOnScreen?,
        now: TimeInterval
    ) -> ChatTypingThoughtArrival {
        ChatTypingThoughtPacing.arrival(
            of: ChatTypingThought(id: 2, agentID: "agent_1", runID: run, text: text),
            onScreen: onScreen,
            now: now
        )
    }
}
