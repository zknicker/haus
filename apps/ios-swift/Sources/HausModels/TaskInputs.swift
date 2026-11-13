import Foundation

/// `task.list`, one board's Tasks in one read. The Server returns them oldest
/// first; `BoardTaskGroups` orders them for the board.
public struct TaskListInput: Encodable, Equatable, Sendable {
    public let boardID: String
    public let serverID: String

    public init(serverID: String, boardID: String) {
        self.boardID = boardID
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case boardID = "boardId"
        case serverID = "serverId"
    }
}

public struct TaskGetInput: Encodable, Equatable, Sendable {
    public let serverID: String
    public let taskID: String

    public init(serverID: String, taskID: String) {
        self.serverID = serverID
        self.taskID = taskID
    }

    enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
        case taskID = "taskId"
    }
}

/// `task.create`. A nil `columnID` lands on the board's first `todo` column.
/// With `sourceMessageID` (Convert to Task) a nil `description` defaults to that
/// message's content, and the message is recorded in Mentioned in.
public struct TaskCreateInput: Encodable, Equatable, Sendable {
    public let assignee: TaskActor?
    public let boardID: String
    public let columnID: String?
    public let description: String?
    public let dueOn: String?
    public let labelIDs: [String]?
    public let priority: TaskPriority?
    public let serverID: String
    public let sourceMessageID: String?
    public let title: String

    public init(
        serverID: String,
        boardID: String,
        title: String,
        description: String? = nil,
        columnID: String? = nil,
        assignee: TaskActor? = nil,
        priority: TaskPriority? = nil,
        labelIDs: [String]? = nil,
        dueOn: String? = nil,
        sourceMessageID: String? = nil
    ) {
        self.assignee = assignee
        self.boardID = boardID
        self.columnID = columnID
        self.description = description
        self.dueOn = dueOn
        self.labelIDs = labelIDs
        self.priority = priority
        self.serverID = serverID
        self.sourceMessageID = sourceMessageID
        self.title = title
    }

    enum CodingKeys: String, CodingKey {
        case assignee
        case boardID = "boardId"
        case columnID = "columnId"
        case description
        case dueOn
        case labelIDs = "labelIds"
        case priority
        case serverID = "serverId"
        case sourceMessageID = "sourceMessageId"
        case title
    }
}

/// What a `task.update` does to the due date. Three states, because the wire
/// tells "leave it" (key absent) from "clear it" (`null`).
public enum TaskDueOnChange: Equatable, Sendable {
    case unchanged
    case cleared
    case set(String)
}

/// At least one field must change; the Server refuses an empty patch.
public struct TaskUpdatePatch: Encodable, Equatable, Sendable {
    public let description: String?
    public let dueOn: TaskDueOnChange
    public let labelIDs: [String]?
    public let priority: TaskPriority?
    public let title: String?

    public init(
        title: String? = nil,
        description: String? = nil,
        priority: TaskPriority? = nil,
        labelIDs: [String]? = nil,
        dueOn: TaskDueOnChange = .unchanged
    ) {
        self.description = description
        self.dueOn = dueOn
        self.labelIDs = labelIDs
        self.priority = priority
        self.title = title
    }

    enum CodingKeys: String, CodingKey {
        case description
        case dueOn
        case labelIDs = "labelIds"
        case priority
        case title
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encodeIfPresent(labelIDs, forKey: .labelIDs)
        try container.encodeIfPresent(priority, forKey: .priority)
        try container.encodeIfPresent(title, forKey: .title)
        switch dueOn {
        case .unchanged: break
        case .cleared: try container.encodeNil(forKey: .dueOn)
        case .set(let day): try container.encode(day, forKey: .dueOn)
        }
    }
}

public struct TaskUpdateInput: Encodable, Equatable, Sendable {
    public let expectedVersion: Int
    public let patch: TaskUpdatePatch
    public let serverID: String
    public let taskID: String

    public init(serverID: String, taskID: String, expectedVersion: Int, patch: TaskUpdatePatch) {
        self.expectedVersion = expectedVersion
        self.patch = patch
        self.serverID = serverID
        self.taskID = taskID
    }

    enum CodingKeys: String, CodingKey {
        case expectedVersion
        case patch
        case serverID = "serverId"
        case taskID = "taskId"
    }
}

/// Moves within the Task's own board; there is no cross-board move.
public struct TaskMoveInput: Encodable, Equatable, Sendable {
    public let columnID: String
    public let expectedVersion: Int
    public let serverID: String
    public let taskID: String

    public init(serverID: String, taskID: String, expectedVersion: Int, columnID: String) {
        self.columnID = columnID
        self.expectedVersion = expectedVersion
        self.serverID = serverID
        self.taskID = taskID
    }

    enum CodingKeys: String, CodingKey {
        case columnID = "columnId"
        case expectedVersion
        case serverID = "serverId"
        case taskID = "taskId"
    }
}

/// A nil `assignee` unassigns, and goes out as `null`: the key is required.
public struct TaskAssignInput: Encodable, Equatable, Sendable {
    public let assignee: TaskActor?
    public let expectedVersion: Int
    public let serverID: String
    public let taskID: String

    public init(serverID: String, taskID: String, expectedVersion: Int, assignee: TaskActor?) {
        self.assignee = assignee
        self.expectedVersion = expectedVersion
        self.serverID = serverID
        self.taskID = taskID
    }

    enum CodingKeys: String, CodingKey {
        case assignee
        case expectedVersion
        case serverID = "serverId"
        case taskID = "taskId"
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(assignee, forKey: .assignee)
        try container.encode(expectedVersion, forKey: .expectedVersion)
        try container.encode(serverID, forKey: .serverID)
        try container.encode(taskID, forKey: .taskID)
    }
}

public struct TaskMutationResult: Decodable, Equatable, Sendable {
    public let task: BoardTask
}
