import Foundation

public enum TaskListAssigneeFilter: Encodable, Equatable, Sendable {
    case user(id: String)
    case agent(id: String)
    case unassigned

    enum CodingKeys: String, CodingKey {
        case userID = "userId"
        case agentID = "agentId"
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case let .user(id):
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(id, forKey: .userID)
        case let .agent(id):
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(id, forKey: .agentID)
        case .unassigned:
            var container = encoder.singleValueContainer()
            try container.encode("none")
        }
    }
}

public struct TaskListInput: Encodable, Equatable, Sendable {
    public let assignee: TaskListAssigneeFilter?
    public let keyID: String?
    public let serverID: String
    public let states: [TaskTargetState]?

    public init?(
        serverID: String,
        assignee: TaskListAssigneeFilter? = nil,
        keyID: String? = nil,
        states: [TaskTargetState]? = nil
    ) {
        if states?.isEmpty == true { return nil }
        self.assignee = assignee
        self.keyID = keyID
        self.serverID = serverID
        self.states = states
    }

    enum CodingKeys: String, CodingKey {
        case assignee
        case keyID = "keyId"
        case serverID = "serverId"
        case states
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
    public static let create = HausProcedure<TaskCreateInput, TaskMutationResult>.mutation("task.create")
    public static let setState = HausProcedure<TaskSetStateInput, TaskMutationResult>.mutation("task.setState")
    public static let assign = HausProcedure<TaskAssignInput, TaskMutationResult>.mutation("task.assign")
    public static let setFollow = HausProcedure<TaskSetFollowInput, TaskFollowReceipt>.mutation("task.setFollow")
    public static let update = HausProcedure<TaskUpdateInput, TaskMutationResult>.mutation("task.update")
    public static let get = HausProcedure<TaskGetInput, TaskDetail>.query("task.get")
    public static let list = HausProcedure<TaskListInput, [TaskRecord]>.query("task.list")
    public static let listOpen = HausProcedure<ServerScopeInput, [TaskRecord]>.query("task.listOpen")
    public static let labels = HausProcedure<ServerScopeInput, [TaskLabel]>.query("taskLabel.list")
}
