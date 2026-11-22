import Foundation

public enum TaskTargetState: String, Codable, CaseIterable, Hashable, Sendable {
    case todo, open, done, canceled
}

public enum TaskText {
    public static let titleMaxCharacters = 200
    public static let descriptionMaxCharacters = 20_000

    static func isValidTitle(_ title: String) -> Bool {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && trimmed.utf16.count <= titleMaxCharacters
    }

    static func isValidDescription(_ description: String) -> Bool {
        description.utf16.count <= descriptionMaxCharacters
    }

    static func isValidDueOn(_ dueOn: String) -> Bool {
        dueOn.wholeMatch(of: /\d{4}-\d{2}-\d{2}/) != nil
    }
}

public struct TaskCreateInput: Encodable, Equatable, Sendable {
    public let assigneeAgentID: String
    public let description: String?
    public let projectID: String
    public let serverID: String
    public let title: String

    public init?(assigneeAgentID: String, description: String? = nil, projectID: String, serverID: String, title: String) {
        guard TaskText.isValidTitle(title), description.map(TaskText.isValidDescription) ?? true else { return nil }
        self.assigneeAgentID = assigneeAgentID
        self.description = description
        self.projectID = projectID
        self.serverID = serverID
        self.title = title
    }

    enum CodingKeys: String, CodingKey {
        case assigneeAgentID = "assigneeAgentId"
        case description
        case projectID = "projectId"
        case serverID = "serverId"
        case title
    }
}

public struct TaskSetStateInput: Encodable, Equatable, Sendable {
    public let expectedVersion: Int
    public let serverID: String
    public let state: TaskTargetState
    public let taskID: String

    public init(expectedVersion: Int, serverID: String, state: TaskTargetState, taskID: String) {
        self.expectedVersion = expectedVersion
        self.serverID = serverID
        self.state = state
        self.taskID = taskID
    }

    enum CodingKeys: String, CodingKey {
        case expectedVersion
        case serverID = "serverId"
        case state
        case taskID = "taskId"
    }
}

public struct TaskAssignInput: Encodable, Equatable, Sendable {
    public let assignee: TaskActor?
    public let expectedVersion: Int
    public let serverID: String
    public let taskID: String

    public init(assignee: TaskActor?, expectedVersion: Int, serverID: String, taskID: String) {
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

public struct TaskSetFollowInput: Encodable, Equatable, Sendable {
    public let followed: Bool
    public let serverID: String
    public let taskID: String

    public init(followed: Bool, serverID: String, taskID: String) {
        self.followed = followed
        self.serverID = serverID
        self.taskID = taskID
    }

    enum CodingKeys: String, CodingKey {
        case followed
        case serverID = "serverId"
        case taskID = "taskId"
    }
}

public struct TaskUpdatePatch: Encodable, Equatable, Sendable {
    public let description: String?
    public let dueOn: NullableChange<String>?
    public let labelIDs: [String]?
    public let priority: TaskPriority?
    public let title: String?

    public init?(
        description: String? = nil,
        dueOn: NullableChange<String>? = nil,
        labelIDs: [String]? = nil,
        priority: TaskPriority? = nil,
        title: String? = nil
    ) {
        let namesAField = description != nil || dueOn != nil || labelIDs != nil || priority != nil || title != nil
        guard namesAField,
              title.map(TaskText.isValidTitle) ?? true,
              description.map(TaskText.isValidDescription) ?? true,
              labelIDs.map({ Set($0).count == $0.count }) ?? true
        else { return nil }
        if case let .set(date) = dueOn, !TaskText.isValidDueOn(date) { return nil }
        self.description = description
        self.dueOn = dueOn
        self.labelIDs = labelIDs
        self.priority = priority
        self.title = title
    }

    enum CodingKeys: String, CodingKey {
        case description, dueOn, priority, title
        case labelIDs = "labelIds"
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encodeIfPresent(dueOn, forKey: .dueOn)
        try container.encodeIfPresent(labelIDs, forKey: .labelIDs)
        try container.encodeIfPresent(priority, forKey: .priority)
        try container.encodeIfPresent(title, forKey: .title)
    }
}

public struct TaskUpdateInput: Encodable, Equatable, Sendable {
    public let expectedVersion: Int
    public let patch: TaskUpdatePatch
    public let serverID: String
    public let taskID: String

    public init(expectedVersion: Int, patch: TaskUpdatePatch, serverID: String, taskID: String) {
        self.expectedVersion = expectedVersion
        self.patch = patch
        self.serverID = serverID
        self.taskID = taskID
    }

    enum CodingKeys: String, CodingKey {
        case expectedVersion, patch
        case serverID = "serverId"
        case taskID = "taskId"
    }
}
