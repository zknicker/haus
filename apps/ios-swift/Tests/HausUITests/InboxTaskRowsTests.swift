import Foundation
import HausModels
@testable import HausUI
import Testing

/// An assigned Task in the Unread feed: one item per Task, in the same feed as
/// unread Chats and Threads, resolved in place.
struct InboxTaskRowsTests {
    private let columns = [
        BoardColumn(category: .todo, id: "todo", name: "Todo", position: 0),
        BoardColumn(category: .active, id: "doing", name: "In progress", position: 1),
        BoardColumn(category: .active, id: "review", name: "Needs review", position: 2),
        BoardColumn(category: .done, id: "shipped", name: "Shipped", position: 3),
        BoardColumn(category: .canceled, id: "dropped", name: "Canceled", position: 4),
    ]

    @Test func mergesIntoTheFeedByWhenItWasAssigned() {
        let rows = InboxUnreadRows.rows(
            [
                InboxFixtures.chat(id: "older", name: "all", lastActivityAt: Date(timeIntervalSince1970: 100)),
                InboxFixtures.chat(id: "newer", name: "product", lastActivityAt: Date(timeIntervalSince1970: 300)),
            ],
            tasks: [item(id: "task_1", assignedAt: Date(timeIntervalSince1970: 200))],
            viewerDisplayName: "Marlow"
        )

        #expect(rows.map(\.id) == ["newer", "task:task_1", "older"])
    }

    /// Ten assignments are ten items, because the Inbox is worked one at a time.
    @Test func neverBundlesItems() {
        let rows = InboxUnreadRows.rows(
            [],
            tasks: (1...3).map { item(id: "task_\($0)") },
            viewerDisplayName: nil
        )

        #expect(rows.count == 3)
    }

    @Test func aTaskRowOpensItsTaskAndCarriesItsItem() throws {
        let row = try #require(
            InboxUnreadRows.rows([], tasks: [item(id: "task_1")], viewerDisplayName: nil).first
        )

        #expect(row.open == .task(taskID: "task_1"))
        #expect(row.kind == .task(item(id: "task_1")))
    }

    @Test func aConversationRowStaysAConversation() throws {
        let row = try #require(
            InboxUnreadRows.rows([InboxFixtures.chat(id: "c", name: "all")], viewerDisplayName: nil).first
        )

        #expect(row.kind == .conversation)
    }

    /// Start, Done, and Won't do land on the board's first column of each.
    @Test func eachResolutionLandsOnTheFirstColumnOfItsCategory() {
        let resolutions = item(id: "task_1").resolutions

        #expect(resolutions.map(\.resolution) == [.start, .done, .wontDo])
        #expect(resolutions.map(\.column.id) == ["doing", "shipped", "dropped"])
    }

    @Test func offersNoResolutionThatWouldMoveNothing() {
        let started = item(id: "task_1", columnID: "doing", category: .active)

        #expect(started.resolutions.map(\.resolution) == [.done, .wontDo])
    }

    /// A board with no canceled column has no Won't do to offer.
    @Test func offersNoResolutionTheBoardHasNoColumnFor() {
        let board = item(id: "task_1", columns: columns.filter { $0.category != .canceled })

        #expect(board.resolutions.map(\.resolution) == [.start, .done])
    }

    /// Until `board.list` lands there is nothing to move to, and the status
    /// reads the wire's category rather than a guessed name.
    @Test func waitsForTheBoardRatherThanGuessing() {
        let unloaded = item(id: "task_1", columns: [])

        #expect(unloaded.resolutions.isEmpty)
        #expect(unloaded.columnName == "Todo")
        #expect(item(id: "task_1", columnID: "doing", category: .active).columnName == "In progress")
    }

    private func item(
        id: String,
        assignedAt: Date = Date(timeIntervalSince1970: 200),
        columnID: String = "todo",
        category: ColumnCategory = .todo,
        columns: [BoardColumn]? = nil
    ) -> InboxTaskItem {
        InboxTaskItem(
            id: id,
            key: "SEC-27",
            title: "Review the vault",
            boardName: "Security",
            assignerName: "Zero",
            assignerAvatarURL: nil,
            assignedAt: assignedAt,
            priority: .high,
            dueOn: nil,
            columnID: columnID,
            category: category,
            columns: columns ?? self.columns,
            context: nil
        )
    }
}
