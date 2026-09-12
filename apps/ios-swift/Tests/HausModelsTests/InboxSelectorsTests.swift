import Foundation
import XCTest
@testable import HausModels

private struct Claim: StalledClaimTask {
    let id: String
    var live = false
    var origin: TaskOrigin = .composed
    var status: TaskStatus = .todo
    var tier: TaskTier = .tracked
}

final class InboxSelectorsTests: XCTestCase {
    func testSelectsOnlyTheClaimsAnAgentLeftUnfinished() {
        let stalled = InboxNeedsYou.stalledClaims(in: [
            Claim(id: "stalled", origin: .claimed, status: .inProgress),
            Claim(id: "running", live: true, origin: .claimed, status: .inProgress),
            Claim(id: "bookkeeping", origin: .claimed, status: .inProgress, tier: .background),
            Claim(id: "converted", origin: .converted, status: .inProgress),
            Claim(id: "in-review", origin: .claimed, status: .inReview),
            Claim(id: "todo", origin: .claimed),
        ])

        XCTAssertEqual(stalled.map(\.id), ["stalled"])
    }

    func testAddsTheOpenAsksToTheStalledClaims() {
        let count = InboxNeedsYou.count(
            askCount: 2,
            tasks: [
                Claim(id: "stalled", origin: .claimed, status: .inProgress),
                Claim(id: "another", origin: .claimed, status: .inProgress),
            ]
        )

        XCTAssertEqual(count, 4)
    }

    func testCountsNothingTheSectionWouldNotList() {
        let count = InboxNeedsYou.count(
            askCount: 0,
            tasks: [
                Claim(id: "running-claim", live: true, origin: .claimed, status: .inProgress),
                Claim(id: "bookkeeping", origin: .claimed, status: .inProgress, tier: .background),
                Claim(id: "in-review", status: .inReview),
                Claim(id: "todo"),
            ]
        )

        XCTAssertEqual(count, 0)
    }

    /// The selectors read the wire Task projection directly, so the Inbox and
    /// the Task list can never disagree about what a claim is.
    func testReadsAStalledClaimStraightFromTheServerTaskProjection() throws {
        let json = """
        {"assigneeAgentId":"agent_1","assigneeUserId":null,"chatId":"chat_1",
         "claimedAt":"2026-09-10T18:00:00.000Z","createdAt":"2026-09-10T17:59:00.000Z",
         "createdByAgentId":"agent_1","createdByUserId":null,"labels":[],"live":false,
         "messageId":"message_1","number":4,"origin":"claimed","priority":"none",
         "status":"in_progress","threadChatId":"chat_thread","tier":"tracked",
         "updatedAt":"2026-09-10T18:30:00.000Z","version":2}
        """

        let task = try HausJSON.decoder().decode(MessageTask.self, from: Data(json.utf8))

        XCTAssertEqual(InboxNeedsYou.stalledClaims(in: [task]).count, 1)
        XCTAssertEqual(InboxNeedsYou.count(askCount: 1, tasks: [task]), 2)
    }
}
