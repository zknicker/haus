import Foundation
import HausModels
import OSLog

/// Reads and writes for boards and Tasks. A list is one read however long it
/// is; rows carry everything they draw, so nothing here fans out per row.
extension HausStore {
    func boardTasks(boardID: String) -> [BoardTask]? {
        taskSnapshots.tasksByBoardID[boardID]?.map(taskSnapshots.settled)
    }

    func taskDetail(taskID: String) -> BoardTaskDetail? {
        guard var detail = taskSnapshots.detailsByID[taskID] else { return nil }
        detail.task = taskSnapshots.settled(detail.task)
        return detail
    }

    // MARK: - Reads

    /// Archived boards come back too: the picker lists them in their own
    /// section, so one read answers both.
    func reloadBoards() async throws {
        let serverID = try activeServerID()
        let readStart = realtimeReconciliation.beginRead()
        let boards: [Board] = try await client.query(
            "board.list",
            input: BoardListInput(serverID: serverID, includeArchived: true)
        )
        guard activeServer?.id == serverID,
              realtimeReconciliation.landed(.boards, readStartedAt: readStart)
        else { return }
        if taskSnapshots.boards != boards { taskSnapshots.boards = boards }
    }

    func reloadBoardTasks(boardID: String) async throws {
        let serverID = try activeServerID()
        let token = nextListRead("board:\(boardID)")
        let tasks: [BoardTask] = try await client.query(
            "task.list",
            input: TaskListInput(serverID: serverID, boardID: boardID)
        )
        guard activeServer?.id == serverID, isNewestListRead("board:\(boardID)", token) else { return }
        if taskSnapshots.tasksByBoardID[boardID] != tasks {
            taskSnapshots.tasksByBoardID[boardID] = tasks
        }
    }

    func reloadTaskDetail(taskID: String) async throws {
        let serverID = try activeServerID()
        let token = nextListRead("task:\(taskID)")
        let detail: BoardTaskDetail = try await client.query(
            "task.get",
            input: TaskGetInput(serverID: serverID, taskID: taskID)
        )
        guard activeServer?.id == serverID, isNewestListRead("task:\(taskID)", token) else { return }
        if taskSnapshots.detailsByID[taskID] != detail { taskSnapshots.detailsByID[taskID] = detail }
    }

    func reloadTaskLabels() async throws {
        let serverID = try activeServerID()
        let labels: [TaskLabel] = try await client.query(
            "taskLabel.list",
            input: ServerScopedInput(serverId: serverID)
        )
        guard activeServer?.id == serverID else { return }
        if taskSnapshots.labels != labels { taskSnapshots.labels = labels }
    }

    /// The reads one batch of live events asks for, against what is held.
    func applyTaskEffects(_ effects: ChatRealtimeEffects) async {
        let snapshots = taskSnapshots
        let boardIDs = effects.boardIDsToReload.filter { snapshots.tasksByBoardID[$0] != nil }
        let detailIDs = effects.changedTaskIDs.filter { snapshots.detailsByID[$0] != nil }
        let readsBoards = !effects.boardIDsToReload.isEmpty && snapshots.boards != nil
        let readsLabels = !effects.changedLabelIDs.isEmpty && snapshots.labels != nil
        let readsInbox = effects.reloadsTaskInbox
            || snapshots.inboxItems?.contains { effects.changedTaskIDs.contains($0.id) } == true

        await withTaskGroup(of: Void.self) { group in
            if readsBoards { group.addTask { await self.logged { try await self.reloadBoards() } } }
            if readsLabels { group.addTask { await self.logged { try await self.reloadTaskLabels() } } }
            for boardID in boardIDs {
                group.addTask { await self.logged { try await self.reloadBoardTasks(boardID: boardID) } }
            }
            for taskID in detailIDs {
                group.addTask { await self.logged { try await self.reloadTaskDetail(taskID: taskID) } }
            }
            if readsInbox { group.addTask { await self.loadTaskInbox() } }
            // The badge counts uncleared items, and only the Server counts
            // them across every Server.
            if effects.reloadsTaskInbox { group.addTask { await self.refreshIconBadge() } }
        }
    }

    /// A stream start reconciles what it owns, against what is held. The Task
    /// Inbox is shell state, so it always reads: the Inbox dot counts it.
    func recoverTaskProjections(_ projections: Set<RealtimeProjection>) async {
        let snapshots = taskSnapshots
        await withTaskGroup(of: Void.self) { group in
            if projections.contains(.boards), snapshots.boards != nil {
                group.addTask { await self.logged { try await self.reloadBoards() } }
            }
            if projections.contains(.taskLabels), snapshots.labels != nil {
                group.addTask { await self.logged { try await self.reloadTaskLabels() } }
            }
            if projections.contains(.boardTasks) {
                group.addTask { await self.recoverBoardTasks() }
            }
            if projections.contains(.taskInbox) {
                group.addTask { await self.loadTaskInbox() }
            }
        }
    }

    private func recoverBoardTasks() async {
        let readStart = realtimeReconciliation.beginRead()
        let boardIDs = Array(taskSnapshots.tasksByBoardID.keys)
        let taskIDs = Array(taskSnapshots.detailsByID.keys)
        await withTaskGroup(of: Void.self) { group in
            for boardID in boardIDs {
                group.addTask { await self.logged { try await self.reloadBoardTasks(boardID: boardID) } }
            }
            for taskID in taskIDs {
                group.addTask { await self.logged { try await self.reloadTaskDetail(taskID: taskID) } }
            }
        }
        realtimeReconciliation.landed(.boardTasks, readStartedAt: readStart)
    }

    // MARK: - Task writes

    /// Moves a Task, showing it in the new column at once. The column is an
    /// overlay until the Server answers, so a list read landing in between
    /// neither flickers it back nor is overwritten. A refused move, usually a
    /// stale `expectedVersion`, re-reads so the next try starts from the truth.
    @discardableResult
    func moveTask(_ task: BoardTask, toColumnID columnID: String) async throws -> BoardTask {
        let serverID = try activeServerID()
        guard task.columnID != columnID, taskSnapshots.pendingMoves[task.id] == nil else { return task }
        taskSnapshots.pendingMoves[task.id] = columnID
        defer { taskSnapshots.pendingMoves[task.id] = nil }
        return try await writeTask(task) {
            let receipt: TaskMutationResult = try await client.mutation(
                "task.move",
                input: TaskMoveInput(
                    serverID: serverID,
                    taskID: task.id,
                    expectedVersion: task.version,
                    columnID: columnID
                )
            )
            return receipt.task
        }
    }

    @discardableResult
    func updateTask(_ task: BoardTask, patch: TaskUpdatePatch) async throws -> BoardTask {
        let serverID = try activeServerID()
        return try await writeTask(task) {
            let receipt: TaskMutationResult = try await client.mutation(
                "task.update",
                input: TaskUpdateInput(
                    serverID: serverID,
                    taskID: task.id,
                    expectedVersion: task.version,
                    patch: patch
                )
            )
            return receipt.task
        }
    }

    func assignTask(_ task: BoardTask, to assignee: TaskActor?) async throws {
        let serverID = try activeServerID()
        try await writeTask(task) {
            let receipt: TaskMutationResult = try await client.mutation(
                "task.assign",
                input: TaskAssignInput(
                    serverID: serverID,
                    taskID: task.id,
                    expectedVersion: task.version,
                    assignee: assignee
                )
            )
            return receipt.task
        }
    }

    func createTask(_ input: TaskCreateInput) async throws -> BoardTask {
        let receipt: TaskMutationResult = try await client.mutation("task.create", input: input)
        taskSnapshots.land(receipt.task)
        return receipt.task
    }

    @discardableResult
    private func writeTask(
        _ task: BoardTask,
        _ write: () async throws -> BoardTask
    ) async throws -> BoardTask {
        do {
            let written = try await write()
            taskSnapshots.land(written)
            return written
        } catch {
            if taskSnapshots.tasksByBoardID[task.boardID] != nil {
                await logged { try await self.reloadBoardTasks(boardID: task.boardID) }
            }
            if taskSnapshots.detailsByID[task.id] != nil {
                await logged { try await self.reloadTaskDetail(taskID: task.id) }
            }
            if taskSnapshots.inboxItems?.contains(where: { $0.id == task.id }) == true {
                await loadTaskInbox()
            }
            throw error
        }
    }

    // MARK: - Board writes

    func createBoard(key: String, name: String) async throws -> Board {
        let serverID = try activeServerID()
        let receipt: BoardMutationResult = try await client.mutation(
            "board.create",
            input: BoardCreateInput(serverID: serverID, key: key, name: name)
        )
        taskSnapshots.land(receipt.board)
        return receipt.board
    }

    /// A Board settings save: the board's own fields, then its columns, each
    /// on the version the step before answered with. A refused write re-reads
    /// the board and its Tasks, so the editor's next save starts from the truth.
    func saveBoard(_ board: Board, patch: BoardUpdatePatch, columns: BoardColumnPlan?) async throws {
        let serverID = try activeServerID()
        do {
            var version = board.version
            if !patch.isEmpty {
                let receipt: BoardMutationResult = try await client.mutation(
                    "board.update",
                    input: BoardUpdateInput(
                        serverID: serverID,
                        boardID: board.id,
                        expectedVersion: version,
                        patch: patch
                    )
                )
                version = receipt.board.version
                taskSnapshots.land(receipt.board)
            }
            if let columns {
                let receipt: BoardMutationResult = try await client.mutation(
                    "board.setColumns",
                    input: BoardSetColumnsInput(
                        serverID: serverID,
                        boardID: board.id,
                        expectedVersion: version,
                        columns: columns.drafts,
                        moveTasks: columns.moveTasks
                    )
                )
                taskSnapshots.land(receipt.board)
            }
        } catch {
            await logged { try await self.reloadBoards() }
            throw error
        }
        await logged { try await self.reloadBoardTasks(boardID: board.id) }
    }

    // MARK: - Support

    func activeServerID() throws -> String {
        guard let serverID = activeServer?.id else { throw HausStoreError.serverUnavailable }
        return serverID
    }

    /// A background read that failed keeps the previous snapshot and is logged:
    /// a stale row is honest, and nobody asked for this read.
    private func logged(_ read: () async throws -> Void) async {
        do {
            try await read()
        } catch {
            Self.logger.error("Refreshing tasks failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func nextListRead(_ key: String) -> Int {
        let token = (taskSnapshots.listReadTokens[key] ?? 0) + 1
        taskSnapshots.listReadTokens[key] = token
        return token
    }

    private func isNewestListRead(_ key: String, _ token: Int) -> Bool {
        taskSnapshots.listReadTokens[key] == token
    }
}
