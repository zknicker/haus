import Foundation
import HausModels
import Observation
import OSLog

/// The Server's boards and Tasks as this client holds them.
///
/// Every list stays absent until its first read, so "nothing here" is never
/// confused with "not yet known", and a durable event refreshes only what is
/// held. It is its own observable so a move repaints the board without touching
/// anything that watches the Store's Chat state.
@MainActor
@Observable
final class TaskSnapshots {
    var boards: [Board]?
    var tasksByBoardID: [String: [BoardTask]] = [:]
    var detailsByID: [String: BoardTaskDetail] = [:]
    var labels: [TaskLabel]?
    /// The reader's uncleared Task Inbox items, nil until first read
    /// (`HausStoreInbox.swift`).
    var inboxItems: [TaskInboxItem]?
    /// Moves still settling, by Task id and the column each one is going to.
    /// App-local: the read snapshots above only ever hold Server answers.
    var pendingMoves: [String: String] = [:]
    /// Items a clear or a resolution has taken off the Inbox, until it settles.
    var settlingInboxTaskIDs: Set<String> = []
    /// The newest read started per list, so an older answer writes nothing.
    @ObservationIgnored var listReadTokens: [String: Int] = [:]

    func reset() {
        boards = nil
        tasksByBoardID = [:]
        detailsByID = [:]
        labels = nil
        inboxItems = nil
        pendingMoves = [:]
        settlingInboxTaskIDs = []
        listReadTokens = [:]
    }

    /// A Task the Server just answered with, wherever a copy of it lives. An
    /// older answer never overwrites a newer one.
    func land(_ task: BoardTask) {
        var list = tasksByBoardID[task.boardID] ?? []
        if let index = list.firstIndex(where: { $0.id == task.id }) {
            if list[index].version <= task.version { list[index] = task }
        } else {
            list.append(task)
        }
        if tasksByBoardID[task.boardID] != nil { tasksByBoardID[task.boardID] = list }
        if var detail = detailsByID[task.id], detail.task.version <= task.version {
            detail.task = task
            detailsByID[task.id] = detail
        }
        if let index = inboxItems?.firstIndex(where: { $0.id == task.id }),
           inboxItems?[index].task.version ?? 0 <= task.version {
            inboxItems?[index].task = task
        }
    }

    func land(_ board: Board) {
        var list = boards ?? []
        if let index = list.firstIndex(where: { $0.id == board.id }) {
            list[index] = board
        } else {
            list.append(board)
        }
        if boards != nil { boards = list }
    }

    /// A Task as it should read right now: the Server's copy, in the column a
    /// settling move is taking it to.
    func settled(_ task: BoardTask) -> BoardTask {
        guard let columnID = pendingMoves[task.id],
              let column = boards?.first(where: { $0.id == task.boardID })?.column(id: columnID)
        else { return task }
        return task.moved(to: column)
    }
}

