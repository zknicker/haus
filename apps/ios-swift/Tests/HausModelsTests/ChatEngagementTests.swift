import Foundation
import XCTest
@testable import HausModels

final class ChatEngagementTests: XCTestCase {
    func testDecodesTheDurableReadAndBothEventKinds() throws {
        let read = try decode(ChatEngagements.self, """
        {"engagements":[{"agentId":"agent_1","chatId":"chat_1","runId":"run_1","startedAt":"2026-10-07T12:00:00Z"}]}
        """)
        XCTAssertEqual(read.engagements.map(\.runID), ["run_1"])

        let started = try decode(ChatEngagementEvent.self, event(type: "chat.engagement.started"))
        XCTAssertEqual(started.kind, .started)
        XCTAssertEqual(started.agentID, "agent_1")

        let ended = try decode(
            ChatEngagementEvent.self,
            event(type: "chat.engagement.ended", extra: #""reason":"sent","#)
        )
        XCTAssertEqual(ended.kind, .ended(.sent))
    }

    func testAnUnknownEventTypeFailsToDecode() {
        XCTAssertThrowsError(try decode(ChatEngagementEvent.self, event(type: "chat.engagement.paused")))
    }

    func testDecodesAThought() throws {
        let thought = try decode(AgentThoughtEvent.self, """
        {"agentId":"agent_1","at":"2026-10-07T12:00:01Z","chatId":"chat_1","runId":"run_1","serverId":"server_1","text":"Checking the weekend forecast"}
        """)
        XCTAssertEqual(thought.text, "Checking the weekend forecast")
    }

    func testApplyingAddsAStartOnceAndRemovesItsEnd() {
        let start = makeEvent(.started, run: "run_1")
        let once = try? XCTUnwrap([ChatEngagement]().applying(start))
        XCTAssertEqual(once?.map(\.runID), ["run_1"])
        XCTAssertNil(once?.applying(start), "A repeated start changes nothing")

        let otherAgentsEnd = makeEvent(.ended(.settled), run: "run_1", agent: "agent_2")
        XCTAssertNil(once?.applying(otherAgentsEnd), "An end must name the same Agent and run")

        XCTAssertEqual(once?.applying(makeEvent(.ended(.sent), run: "run_1")), [])
        XCTAssertNil([ChatEngagement]().applying(makeEvent(.ended(.sent), run: "run_9")))
    }

    // MARK: - Holds

    func testASentEndHoldsUntilItsReplyLands() throws {
        let end = makeEvent(.ended(.sent), run: "run_1", at: 100)
        let hold = try XCTUnwrap(ChatTypingHold.hold(for: end, messages: [], now: date(100)))
        XCTAssertEqual(hold.expiresAt, date(102))
        XCTAssertFalse(hold.isReleased(messages: [], now: date(101)))

        let reply = message(run: "run_1", agent: "agent_1", at: 99.5)
        XCTAssertTrue(hold.isReleased(messages: [reply], now: date(101)))
        XCTAssertTrue(hold.isReleased(messages: [], now: date(102)), "A hold gives up after two seconds")
    }

    func testASentEndWhoseReplyIsAlreadyThereHoldsNothing() {
        let end = makeEvent(.ended(.sent), run: "run_1", at: 100)
        let reply = message(run: "run_1", agent: "agent_1", at: 99)
        XCTAssertNil(ChatTypingHold.hold(for: end, messages: [reply], now: date(100)))
    }

    func testOnlyTheRunsOwnRecentReplyCounts() {
        let end = makeEvent(.ended(.sent), run: "run_1", at: 100)
        let interim = message(run: "run_1", agent: "agent_1", at: 90)
        let otherRun = message(run: "run_2", agent: "agent_1", at: 100)
        let otherAgent = message(run: "run_1", agent: "agent_2", at: 100)
        XCTAssertNotNil(ChatTypingHold.hold(for: end, messages: [interim, otherRun, otherAgent], now: date(100)))
    }

    func testSettledAndInterruptedEndsLeaveAtOnce() {
        XCTAssertNil(ChatTypingHold.hold(for: makeEvent(.ended(.settled), run: "run_1"), messages: [], now: date(0)))
        XCTAssertNil(ChatTypingHold.hold(for: makeEvent(.ended(.interrupted), run: "run_1"), messages: [], now: date(0)))
    }

    func testHeldEngagementsFollowLiveOnesWithoutRepeatingARun() throws {
        let live = ChatEngagement(agentID: "agent_1", chatID: "chat_1", runID: "run_1", startedAt: date(0))
        let hold = try XCTUnwrap(
            ChatTypingHold.hold(for: makeEvent(.ended(.sent), run: "run_2", agent: "agent_2"), messages: [], now: date(0))
        )
        XCTAssertEqual([live].withHeld([hold]).map(\.runID), ["run_1", "run_2"])

        let sameRun = try XCTUnwrap(
            ChatTypingHold.hold(for: makeEvent(.ended(.sent), run: "run_1"), messages: [], now: date(0))
        )
        XCTAssertEqual([live].withHeld([sameRun]), [live])
    }

    // MARK: - Helpers

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try HausJSON.decoder().decode(type, from: Data(json.utf8))
    }

    private func event(type: String, extra: String = "") -> String {
        """
        {\(extra)"agentId":"agent_1","chatId":"chat_1","emittedAt":"2026-10-07T12:00:00Z","runId":"run_1","serverId":"server_1","type":"\(type)"}
        """
    }

    private func makeEvent(
        _ kind: ChatEngagementEvent.Kind,
        run: String,
        agent: String = "agent_1",
        at seconds: TimeInterval = 0
    ) -> ChatEngagementEvent {
        ChatEngagementEvent(
            agentID: agent,
            chatID: "chat_1",
            emittedAt: date(seconds),
            runID: run,
            serverID: "server_1",
            kind: kind
        )
    }

    private func date(_ seconds: TimeInterval) -> Date { Date(timeIntervalSince1970: seconds) }

    private func message(run: String, agent: String, at seconds: TimeInterval) -> ChatMessage {
        ChatMessage(
            attachments: [],
            author: .agent(agentID: agent, profile: nil),
            body: .text,
            cause: nil,
            chatID: "chat_1",
            content: "Done.",
            createdAt: date(seconds),
            id: "message_\(run)_\(agent)_\(seconds)",
            nonce: "nonce",
            reply: nil,
            runID: run,
            sequence: 1,
            serverID: "server_1",
            sessionGeneration: nil,
            task: nil
        )
    }
}
