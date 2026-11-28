import Foundation
import HausModels
import HausTransport

/// One `task.list` answer: the active Tasks or the archived ones.
public struct TaskListSnapshot: Equatable, Sendable {
    public let archived: Bool
    public let tasks: [TaskRecord]
}

extension TasksModel {
    // MARK: - Lists

    public func reloadActiveTasks() async throws {
        let read = try beginActiveTasksRead()
        let loaded = try await client.call(TaskProcedures.listActive, ServerScopeInput(serverID: read.serverID))
        landActiveTasks(loaded, for: read)
    }

    public func beginActiveTasksRead() throws -> ScopedRead<WholeList> {
        try activeReads.begin(.all, in: scope)
    }

    @discardableResult
    public func landActiveTasks(_ tasks: [TaskRecord], for read: ScopedRead<WholeList>) -> Bool {
        guard scope.accepts(read, in: activeReads) else { return false }
        if activeTasks != tasks { activeTasks = tasks }
        return true
    }

    /// Shows the active or archived Tasks, and keeps that list fresh: task
    /// events refresh the list shown last.
    public func showList(archived: Bool) async throws {
        let read = try beginListRead(archived: archived)
        let loaded = try await client.call(TaskProcedures.list, TaskListInput(serverID: read.serverID, archived: archived))
        landList(loaded, for: read, archived: archived)
    }

    public func beginListRead(archived: Bool) throws -> ScopedRead<WholeList> {
        listArchived = archived
        return try listReads.begin(.all, in: scope)
    }

    @discardableResult
    public func landList(_ tasks: [TaskRecord], for read: ScopedRead<WholeList>, archived: Bool) -> Bool {
        guard scope.accepts(read, in: listReads) else { return false }
        let snapshot = TaskListSnapshot(archived: archived, tasks: tasks)
        if list != snapshot { list = snapshot }
        return true
    }

    /// The Tasks tab's reads: the list, plus the Projects and unread Task
    /// chats its rows draw from, each read once.
    public func loadList(archived: Bool) async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.logged { try await self.showList(archived: archived) } }
            if projects == nil {
                group.addTask { await self.logged { try await self.reloadProjects() } }
            }
            if unreadTasks == nil {
                group.addTask { await self.refreshUnreadTasks() }
            }
        }
    }

    // MARK: - Realtime

    /// The reads one batch of live events asks for, against what is held.
    public func apply(_ effects: ChatRealtimeEffects) async {
        let detailIDs = effects.changedTaskIDs.filter { detailsByID[$0] != nil }
        let readsLists = !effects.changedTaskIDs.isEmpty
        await withTaskGroup(of: Void.self) { group in
            for taskID in detailIDs {
                group.addTask { await self.logged { try await self.reloadDetail(taskID: taskID) } }
            }
            if readsLists { group.addTask { await self.refreshHeldLists() } }
        }
    }

    /// A stream start reconciles what it owns, against what is held.
    public func recover(_ projections: Set<RealtimeProjection>) async {
        await withTaskGroup(of: Void.self) { group in
            if projections.contains(.taskDetails) {
                group.addTask { await self.recoverDetails() }
                group.addTask { await self.refreshHeldLists() }
            }
            if projections.contains(.unreadTasks), unreadTasks != nil {
                group.addTask { await self.logged { try await self.reloadUnreadTasks() } }
            }
            if projections.contains(.projects), projects != nil {
                group.addTask { await self.logged { try await self.reloadProjects() } }
            }
        }
    }

    /// Refreshes the unread Task chats, keeping the previous snapshot when the
    /// read fails.
    public func refreshUnreadTasks() async {
        guard scope.ticket != nil else { return }
        await logged { try await reloadUnreadTasks() }
    }

    /// Refreshes the active Tasks, keeping the previous snapshot when the read
    /// fails.
    public func refreshActiveTasks() async {
        guard scope.ticket != nil else { return }
        await logged { try await reloadActiveTasks() }
    }

    private func refreshHeldLists() async {
        let archived = list == nil ? nil : listArchived
        await withTaskGroup(of: Void.self) { group in
            if activeTasks != nil {
                group.addTask { await self.logged { try await self.reloadActiveTasks() } }
            }
            if let archived {
                group.addTask { await self.logged { try await self.showList(archived: archived) } }
            }
        }
    }

    private func recoverDetails() async {
        let readStart = scope.reconciliation.beginRead()
        let taskIDs = Array(detailsByID.keys)
        await withTaskGroup(of: Void.self) { group in
            for taskID in taskIDs {
                group.addTask { await self.logged { try await self.reloadDetail(taskID: taskID) } }
            }
        }
        scope.reconciliation.landed(.taskDetails, readStartedAt: readStart)
    }

    /// A background read that failed keeps the previous snapshot and is
    /// logged: a stale row is honest, and nobody asked for this read.
    func logged(_ read: () async throws -> Void) async {
        do {
            try await read()
        } catch {
            Self.logger.error("Refreshing tasks failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}
