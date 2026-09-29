import Foundation
import XCTest
@testable import HausModels

private struct Row: TaskListGroupable {
    let id: String
    var live = false
    var origin: TaskOrigin = .composed
    var status: TaskStatus = .todo
    var tier: TaskTier = .tracked
}

final class TaskListGroupsTests: XCTestCase {
    func testSelectsOnlyTheClaimsAnAgentLeftUnfinished() {
        let rows = [
            Row(id: "stalled", origin: .claimed, status: .inProgress),
            Row(id: "running", live: true, origin: .claimed, status: .inProgress),
            Row(id: "bookkeeping", origin: .claimed, status: .inProgress, tier: .background),
            Row(id: "converted", origin: .converted, status: .inProgress),
            Row(id: "in-review", origin: .claimed, status: .inReview),
            Row(id: "todo", origin: .claimed),
        ]

        XCTAssertEqual(rows.filter(TaskListGroup.isStoppedBeforeFinishing).map(\.id), ["stalled"])
    }

    func testLeadsWithReviewThenStoppedClaimsThenTheLifecycle() {
        let groups = TaskListGroup.grouped([
            Row(id: "done", status: .done),
            Row(id: "working", status: .inProgress),
            Row(id: "stalled", origin: .claimed, status: .inProgress),
            Row(id: "todo"),
            Row(id: "review", status: .inReview),
        ])

        XCTAssertEqual(
            groups.map(\.group.title),
            ["Needs your review", "Stopped before finishing", "To do", "In progress", "Done"]
        )
        XCTAssertEqual(groups[1].items.map(\.id), ["stalled"])
        XCTAssertEqual(groups[3].items.map(\.id), ["working"])
    }

    /// The grouping reads the wire Task projection directly.
    func testReadsAStoppedClaimStraightFromTheServerTaskProjection() throws {
        let json = """
        {"assigneeAgentId":"agent_1","chatId":"chat_1",
         "claimedAt":"2026-09-10T18:00:00.000Z","createdAt":"2026-09-10T17:59:00.000Z",
         "createdByAgentId":"agent_1","createdByUserId":null,"labels":[],"live":false,
         "messageId":"message_1","number":4,"origin":"claimed","priority":"none",
         "status":"in_progress","threadChatId":"chat_thread","tier":"tracked",
         "updatedAt":"2026-09-10T18:30:00.000Z","version":2}
        """

        let task = try HausJSON.decoder().decode(MessageTask.self, from: Data(json.utf8))

        XCTAssertEqual(TaskListGroup.of(task), .stoppedBeforeFinishing)
    }
}
