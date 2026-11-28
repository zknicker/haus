import Foundation
import HausModels
import HausTransport

public enum TaskWriteError: LocalizedError, Equatable {
    case invalidTitle

    public var errorDescription: String? {
        "Give the Task a title of up to \(TaskText.titleMaxCharacters) characters."
    }
}

extension TasksModel {
    // MARK: - Projects

    public func reloadProjects() async throws {
        let read = try beginProjectsRead()
        let loaded = try await client.call(ProjectProcedures.list, ServerScopeInput(serverID: read.serverID))
        landProjects(loaded, for: read)
    }

    public func beginProjectsRead() throws -> ScopedRead<WholeList> {
        try projectReads.begin(.all, in: scope)
    }

    @discardableResult
    public func landProjects(_ loaded: [Project], for read: ScopedRead<WholeList>) -> Bool {
        guard scope.accepts(read, in: projectReads) else { return false }
        if projects != loaded { projects = loaded }
        return true
    }

    // MARK: - Writes

    /// `task.start`, and lands the Server's record.
    public func start(_ input: TaskStartInput) async throws -> TaskRecord {
        let ticket = try scope.requireTicket()
        let result = try await client.call(TaskProcedures.start, input)
        landWrite(result.task, ticket: ticket)
        return result.task
    }

    /// Archives or restores `task`. Restoring starts no turn.
    public func setArchived(_ archived: Bool, of task: TaskRecord) async throws {
        let ticket = try scope.requireTicket()
        let input = TaskArchiveInput(expectedVersion: task.version, serverID: ticket.serverID, taskID: task.id)
        let procedure = archived ? TaskProcedures.archive : TaskProcedures.unarchive
        landWrite(try await client.call(procedure, input).task, ticket: ticket)
    }

    public func rename(_ task: TaskRecord, to title: String) async throws {
        let ticket = try scope.requireTicket()
        guard let input = TaskUpdateInput(title: title, expectedVersion: task.version, serverID: ticket.serverID, taskID: task.id)
        else { throw TaskWriteError.invalidTitle }
        landWrite(try await client.call(TaskProcedures.update, input).task, ticket: ticket)
    }

    public func setFollow(_ followed: Bool, taskID: String) async throws {
        let ticket = try scope.requireTicket()
        let input = TaskSetFollowInput(followed: followed, serverID: ticket.serverID, taskID: taskID)
        let receipt = try await client.call(TaskProcedures.setFollow, input)
        landFollow(receipt.followed, taskID: receipt.taskID, ticket: ticket)
    }

    /// Lands a write's answer in the detail and the lists that hold its Task,
    /// unless the Server changed while it was in flight or a newer version
    /// already landed. Lists move a Task by archive state on the next read.
    @discardableResult
    public func landWrite(_ task: TaskRecord, ticket: ServerTicket) -> Bool {
        guard scope.isCurrent(ticket) else { return false }
        if let detail = detailsByID[task.id], detail.task.version <= task.version, detail.task != task {
            detailsByID[task.id] = detail.replacing(task: task)
        }
        if let active = activeTasks, let next = Self.replacing(task, in: active), next != active {
            activeTasks = next
        }
        if let list, let next = Self.replacing(task, in: list.tasks), next != list.tasks {
            self.list = TaskListSnapshot(archived: list.archived, tasks: next)
        }
        return true
    }

    @discardableResult
    public func landFollow(_ followed: Bool, taskID: String, ticket: ServerTicket) -> Bool {
        guard scope.isCurrent(ticket) else { return false }
        if let detail = detailsByID[taskID], detail.followed != followed {
            detailsByID[taskID] = detail.replacing(followed: followed)
        }
        return true
    }

    private static func replacing(_ task: TaskRecord, in tasks: [TaskRecord]) -> [TaskRecord]? {
        guard let index = tasks.firstIndex(where: { $0.id == task.id }), tasks[index].version <= task.version else {
            return nil
        }
        var next = tasks
        next[index] = task
        return next
    }
}
