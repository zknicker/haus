import Foundation

/// `task.list`: the active Tasks, or the archived ones.
public struct TaskListInput: Encodable, Equatable, Sendable {
    public let archived: Bool
    public let serverID: String

    public init(serverID: String, archived: Bool = false) {
        self.archived = archived
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case archived
        case serverID = "serverId"
    }
}

public struct TaskMutationResult: Decodable, Equatable, Sendable {
    public let task: TaskRecord
}

public struct TaskFollowReceipt: Decodable, Equatable, Sendable {
    public let followed: Bool
    public let serverID: String
    public let taskID: String

    enum CodingKeys: String, CodingKey {
        case followed
        case serverID = "serverId"
        case taskID = "taskId"
    }
}

public enum TaskProcedures {
    public static let start = HausProcedure<TaskStartInput, TaskMutationResult>.mutation("task.start")
    public static let archive = HausProcedure<TaskArchiveInput, TaskMutationResult>.mutation("task.archive")
    public static let unarchive = HausProcedure<TaskArchiveInput, TaskMutationResult>.mutation("task.unarchive")
    public static let setFollow = HausProcedure<TaskSetFollowInput, TaskFollowReceipt>.mutation("task.setFollow")
    public static let update = HausProcedure<TaskUpdateInput, TaskMutationResult>.mutation("task.update")
    public static let get = HausProcedure<TaskGetInput, TaskDetail>.query("task.get")
    public static let list = HausProcedure<TaskListInput, [TaskRecord]>.query("task.list")
    public static let listActive = HausProcedure<ServerScopeInput, [TaskRecord]>.query("task.listActive")
}
