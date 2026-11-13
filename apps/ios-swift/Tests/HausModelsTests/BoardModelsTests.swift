import Foundation
import XCTest
@testable import HausModels

/// Boards as the wire returns them, and the column editor's early answer.
final class BoardModelsTests: XCTestCase {
    private let columns = [
        BoardColumn(category: .backlog, id: "backlog", name: "Backlog", position: 0),
        BoardColumn(category: .todo, id: "todo", name: "Todo", position: 1),
        BoardColumn(category: .active, id: "active", name: "In progress", position: 2),
        BoardColumn(category: .active, id: "review", name: "Needs review", position: 3),
        BoardColumn(category: .done, id: "done", name: "Done", position: 4),
    ]

    func testDecodesTheBoardListShape() throws {
        let boards = try HausJSON.decoder().decode(
            [Board].self,
            from: Data(
                """
                [{"archivedAt":null,"createdAt":"2026-11-03T00:00:00.000Z","id":"board_1","key":"SEC",
                  "name":"Security","openTaskCount":19,"serverId":"server_1",
                  "updatedAt":"2026-11-03T00:00:00Z","version":2,
                  "columns":[{"category":"active","id":"col_1","name":"In progress","position":0}]}]
                """.utf8
            )
        )

        XCTAssertEqual(boards[0].key, "SEC")
        XCTAssertEqual(boards[0].serverID, "server_1")
        XCTAssertEqual(boards[0].columns, [
            BoardColumn(category: .active, id: "col_1", name: "In progress", position: 0),
        ])
        XCTAssertFalse(boards[0].isArchived)
    }

    func testKeysFollowTheServerPattern() {
        XCTAssertTrue(Board.isValidKey("SEC"))
        XCTAssertTrue(Board.isValidKey("A1"))
        XCTAssertFalse(Board.isValidKey("S"))
        XCTAssertFalse(Board.isValidKey("1SEC"))
        XCTAssertFalse(Board.isValidKey("sec"))
        XCTAssertFalse(Board.isValidKey("SECURE"))
    }

    func testSuggestedKeysAreValidOrEmpty() {
        XCTAssertEqual(Board.suggestedKey(forName: "Security"), "SECUR")
        XCTAssertEqual(Board.suggestedKey(forName: "Mac mini infra"), "MMI")
        XCTAssertEqual(Board.suggestedKey(forName: "2026 roadmap"), "R")
        XCTAssertEqual(Board.suggestedKey(forName: ""), "")
    }

    func testSetColumnsInputSendsIdsOnlyForColumnsThatExist() throws {
        var kept = BoardColumnDraft(column: columns[1])
        kept.name = " Ready "
        let input = BoardSetColumnsInput(
            serverID: "server_1",
            boardID: "board_1",
            expectedVersion: 3,
            columns: [kept, BoardColumnDraft(name: "New", category: .active)],
            moveTasks: ["backlog": "todo"]
        )
        let object = try json(input)
        let drafts = try XCTUnwrap(object["columns"] as? [[String: Any]])

        XCTAssertEqual(object["boardId"] as? String, "board_1")
        XCTAssertEqual(object["expectedVersion"] as? Int, 3)
        XCTAssertEqual(object["moveTasks"] as? [String: String], ["backlog": "todo"])
        XCTAssertEqual(drafts[0]["id"] as? String, "todo")
        XCTAssertEqual(drafts[0]["name"] as? String, "Ready")
        XCTAssertNil(drafts[1]["id"])
        XCTAssertEqual(drafts[1]["category"] as? String, "active")
    }

    func testAnUnchangedPatchIsEmptyAndOmitsItsFields() throws {
        XCTAssertTrue(BoardUpdatePatch().isEmpty)
        XCTAssertFalse(BoardUpdatePatch(archived: true).isEmpty)
        let object = try json(BoardUpdatePatch(name: "Security"))
        XCTAssertEqual(object as? [String: String], ["name": "Security"])
    }

    // MARK: - Column plan

    func testTheLastColumnOfARequiredCategoryIsLocked() {
        let plan = plan(columns.map(BoardColumnDraft.init(column:)))

        XCTAssertFalse(plan.canRemove(draft("todo", in: plan)))
        XCTAssertFalse(plan.canChangeCategory(draft("done", in: plan)))
        // Two Active columns: either can go, and Backlog is never required.
        XCTAssertTrue(plan.canRemove(draft("review", in: plan)))
        XCTAssertTrue(plan.canRemove(draft("backlog", in: plan)))
    }

    func testRemovingAColumnWithTasksNeedsATargetThatStays() {
        let drafts = columns.filter { $0.id != "review" }.map(BoardColumnDraft.init(column:))
        let unset = plan(drafts, taskCounts: ["review": 2])

        XCTAssertEqual(unset.removedWithTasks.map(\.id), ["review"])
        XCTAssertEqual(unset.problems, [.needsTarget(columnID: "review")])

        let set = plan(drafts, taskCounts: ["review": 2], targets: ["review": "active"])
        XCTAssertTrue(set.isValid)
        XCTAssertEqual(set.moveTasks, ["review": "active"])
    }

    func testAnEmptyRemovedColumnMovesNothing() {
        let plan = plan(columns.filter { $0.id != "backlog" }.map(BoardColumnDraft.init(column:)))

        XCTAssertEqual(plan.removed.map(\.id), ["backlog"])
        XCTAssertTrue(plan.isValid)
        XCTAssertNil(plan.moveTasks)
    }

    func testANewColumnCannotReceiveARemovedColumnsTasks() {
        var drafts = columns.filter { $0.id != "review" }.map(BoardColumnDraft.init(column:))
        drafts.append(BoardColumnDraft(id: "draft", name: "QA", category: .active))
        let plan = plan(drafts, taskCounts: ["review": 1], targets: ["review": "draft"])

        XCTAssertFalse(plan.targetChoices.contains { $0.id == "draft" })
        XCTAssertEqual(plan.problems, [.needsTarget(columnID: "review")])
    }

    func testNamesAreCheckedTheWayTheServerChecksThem() {
        var drafts = columns.map(BoardColumnDraft.init(column:))
        drafts[0].name = "  "
        drafts[3].name = "in progress"
        drafts[2].name = String(repeating: "x", count: 41)
        XCTAssertEqual(plan(drafts).problems, [.blankName, .nameTooLong])

        drafts = columns.map(BoardColumnDraft.init(column:))
        drafts[3].name = "IN PROGRESS"
        XCTAssertEqual(plan(drafts).problems, [.duplicateName("IN PROGRESS")])
    }

    func testAMissingRequiredCategoryIsAProblem() {
        var drafts = columns.map(BoardColumnDraft.init(column:))
        drafts[1].category = .backlog
        XCTAssertEqual(plan(drafts).problems, [.missingCategory(.todo)])
    }

    private func plan(
        _ drafts: [BoardColumnDraft],
        taskCounts: [String: Int] = [:],
        targets: [String: String] = [:]
    ) -> BoardColumnPlan {
        BoardColumnPlan(original: columns, drafts: drafts, taskCounts: taskCounts, targets: targets)
    }

    private func draft(_ id: String, in plan: BoardColumnPlan) -> BoardColumnDraft {
        plan.drafts.first { $0.id == id }!
    }

    private func json(_ value: some Encodable) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as? [String: Any])
    }
}
