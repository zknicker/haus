import Foundation
import HausModels
import HausTransport

public enum TaskWriteError: LocalizedError, Equatable {
    case invalidTitle
    case nothingToChange

    public var errorDescription: String? {
        switch self {
        case .invalidTitle: "Give the Task a title of up to \(TaskText.titleMaxCharacters) characters."
        case .nothingToChange: "There is nothing to change."
        }
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

    /// Starts a Task in `projectID` for a Captain, and lands the Server's record.
    public func create(title: String, projectID: String, assigneeAgentID: String, description: String? = nil) async throws -> TaskRecord {
        let ticket = try scope.requireTicket()
        let trimmed = description?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let input = TaskCreateInput(
            assigneeAgentID: assigneeAgentID,
            description: trimmed?.isEmpty == false ? trimmed : nil,
            projectID: projectID,
            serverID: ticket.serverID,
            title: title.trimmingCharacters(in: .whitespacesAndNewlines)
        ) else { throw TaskWriteError.invalidTitle }
        let result = try await client.call(TaskProcedures.create, input)
        landWrite(result.task, ticket: ticket)
        return result.task
    }

    public func setState(_ state: TaskTargetState, of task: TaskRecord) async throws {
        let ticket = try scope.requireTicket()
        let input = TaskSetStateInput(expectedVersion: task.version, serverID: ticket.serverID, state: state, taskID: task.id)
        landWrite(try await client.call(TaskProcedures.setState, input).task, ticket: ticket)
    }

    /// Assigns `task` to a Captain or a person; nil unassigns it.
    public func assign(_ assignee: TaskActor?, to task: TaskRecord) async throws {
        let ticket = try scope.requireTicket()
        let input = Self.assignInput(assignee, to: task, serverID: ticket.serverID)
        landWrite(try await client.call(TaskProcedures.assign, input).task, ticket: ticket)
    }

    public func setFollow(_ followed: Bool, taskID: String) async throws {
        let ticket = try scope.requireTicket()
        let input = TaskSetFollowInput(followed: followed, serverID: ticket.serverID, taskID: taskID)
        let receipt = try await client.call(TaskProcedures.setFollow, input)
        landFollow(receipt.followed, taskID: receipt.taskID, ticket: ticket)
    }

    public func update(_ patch: TaskUpdatePatch?, of task: TaskRecord) async throws {
        guard let patch else { throw TaskWriteError.nothingToChange }
        let ticket = try scope.requireTicket()
        let input = TaskUpdateInput(expectedVersion: task.version, patch: patch, serverID: ticket.serverID, taskID: task.id)
        landWrite(try await client.call(TaskProcedures.update, input).task, ticket: ticket)
    }

    nonisolated public static func assignInput(_ assignee: TaskActor?, to task: TaskRecord, serverID: String) -> TaskAssignInput {
        TaskAssignInput(assignee: assignee, expectedVersion: task.version, serverID: serverID, taskID: task.id)
    }

    /// Lands a write's answer in the detail and the lists that hold its Task,
    /// unless the Server changed while it was in flight or a newer version
    /// already landed.
    @discardableResult
    public func landWrite(_ task: TaskRecord, ticket: ServerTicket) -> Bool {
        guard scope.isCurrent(ticket) else { return false }
        if let detail = detailsByID[task.id], detail.task.version <= task.version, detail.task != task {
            detailsByID[task.id] = detail.replacing(task: task)
        }
        if let open = openTasks, let next = Self.replacing(task, in: open), next != open {
            openTasks = next
        }
        if let list, let next = Self.replacing(task, in: list.tasks), next != list.tasks {
            self.list = TaskListSnapshot(filter: list.filter, tasks: next)
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

extension TaskDetail {
    func replacing(task: TaskRecord? = nil, followed: Bool? = nil) -> TaskDetail {
        let task = task ?? self.task
        return TaskDetail(
            task: task,
            descriptionContent: task.description == self.task.description ? descriptionContent : nil,
            descriptionTaskLinks: task.description == self.task.description ? descriptionTaskLinks : [],
            mentions: mentions,
            reminders: reminders,
            attachedWork: attachedWork,
            pullRequests: pullRequests,
            followed: followed ?? self.followed,
            unreadCount: unreadCount
        )
    }
}
