import Foundation
import HausModels
import HausTransport

/// A `task.list` filter, without the Server it runs against.
public struct TaskListFilter: Hashable, Sendable {
    public enum Assignee: Hashable, Sendable {
        case user(String)
        case agent(String)
        case unassigned
    }

    public let assignee: Assignee?
    public let keyID: String?
    public let states: [TaskTargetState]?

    public init(assignee: Assignee? = nil, keyID: String? = nil, states: [TaskTargetState]? = nil) {
        self.assignee = assignee
        self.keyID = keyID
        self.states = states
    }

    public func input(serverID: String) -> TaskListInput? {
        let assigneeFilter: TaskListAssigneeFilter? = switch assignee {
        case let .user(id): .user(id: id)
        case let .agent(id): .agent(id: id)
        case .unassigned: .unassigned
        case nil: nil
        }
        return TaskListInput(serverID: serverID, assignee: assigneeFilter, keyID: keyID, states: states)
    }
}

/// One filtered list and the filter it answers.
public struct TaskListSnapshot: Equatable, Sendable {
    public let filter: TaskListFilter
    public let tasks: [TaskRecord]
}

public enum TaskListError: LocalizedError, Equatable {
    case emptyStateFilter

    public var errorDescription: String? {
        "Choose at least one Task state."
    }
}

extension TasksModel {
    // MARK: - Lists

    public func reloadOpenTasks() async throws {
        let read = try beginOpenTasksRead()
        let loaded = try await client.call(TaskProcedures.listOpen, ServerScopeInput(serverID: read.serverID))
        landOpenTasks(loaded, for: read)
    }

    public func beginOpenTasksRead() throws -> ScopedRead<WholeList> {
        try openReads.begin(.all, in: scope)
    }

    @discardableResult
    public func landOpenTasks(_ tasks: [TaskRecord], for read: ScopedRead<WholeList>) -> Bool {
        guard scope.accepts(read, in: openReads) else { return false }
        if openTasks != tasks { openTasks = tasks }
        return true
    }

    /// Shows `filter`, and keeps it fresh: task events refresh the filter
    /// shown last.
    public func showList(_ filter: TaskListFilter) async throws {
        let read = try beginListRead(filter)
        guard let input = filter.input(serverID: read.serverID) else { throw TaskListError.emptyStateFilter }
        let loaded = try await client.call(TaskProcedures.list, input)
        landList(loaded, for: read, filter: filter)
    }

    public func beginListRead(_ filter: TaskListFilter) throws -> ScopedRead<WholeList> {
        listFilter = filter
        return try listReads.begin(.all, in: scope)
    }

    @discardableResult
    public func landList(_ tasks: [TaskRecord], for read: ScopedRead<WholeList>, filter: TaskListFilter) -> Bool {
        guard scope.accepts(read, in: listReads) else { return false }
        let snapshot = TaskListSnapshot(filter: filter, tasks: tasks)
        if list != snapshot { list = snapshot }
        return true
    }

    /// The Task board's reads: `filter`'s list, plus the Projects, labels,
    /// and unread Task chats its rows and filters draw from, each read once.
    public func loadBoard(_ filter: TaskListFilter) async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.logged { try await self.showList(filter) } }
            if projects == nil {
                group.addTask { await self.logged { try await self.reloadProjects() } }
            }
            if labels == nil {
                group.addTask { await self.logged { try await self.reloadLabels() } }
            }
            if unreadTasks == nil {
                group.addTask { await self.refreshUnreadTasks() }
            }
        }
    }

    public func loadLabelsIfUnknown() async {
        guard labels == nil else { return }
        await logged { try await reloadLabels() }
    }

    // MARK: - Realtime

    /// The reads one batch of live events asks for, against what is held.
    public func apply(_ effects: ChatRealtimeEffects) async {
        let detailIDs = effects.changedTaskIDs.filter { detailsByID[$0] != nil }
        let readsLabels = !effects.changedLabelIDs.isEmpty && labels != nil
        let readsLists = !effects.changedTaskIDs.isEmpty
        await withTaskGroup(of: Void.self) { group in
            if readsLabels { group.addTask { await self.logged { try await self.reloadLabels() } } }
            for taskID in detailIDs {
                group.addTask { await self.logged { try await self.reloadDetail(taskID: taskID) } }
            }
            if readsLists { group.addTask { await self.refreshHeldLists() } }
        }
    }

    /// A stream start reconciles what it owns, against what is held.
    public func recover(_ projections: Set<RealtimeProjection>) async {
        await withTaskGroup(of: Void.self) { group in
            if projections.contains(.taskLabels), labels != nil {
                group.addTask { await self.logged { try await self.reloadLabels() } }
            }
            if projections.contains(.taskDetails) {
                group.addTask { await self.recoverDetails() }
                group.addTask { await self.refreshHeldLists() }
            }
            if projections.contains(.unreadTasks), unreadTasks != nil {
                group.addTask { await self.logged { try await self.reloadUnreadTasks() } }
            }
        }
    }

    /// Refreshes the unread Task chats, keeping the previous snapshot when the
    /// read fails.
    public func refreshUnreadTasks() async {
        guard scope.ticket != nil else { return }
        await logged { try await reloadUnreadTasks() }
    }

    private func refreshHeldLists() async {
        let filter = list == nil ? nil : listFilter
        await withTaskGroup(of: Void.self) { group in
            if openTasks != nil {
                group.addTask { await self.logged { try await self.reloadOpenTasks() } }
            }
            if let filter {
                group.addTask { await self.logged { try await self.showList(filter) } }
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
