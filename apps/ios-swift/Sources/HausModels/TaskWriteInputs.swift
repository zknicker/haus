import Foundation

public enum TaskText {
    public static let titleMaxCharacters = 200
    public static let promptMaxCharacters = 20_000

    static func isValidTitle(_ title: String) -> Bool {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && trimmed.utf16.count <= titleMaxCharacters
    }

    static func isValidPrompt(_ prompt: String) -> Bool {
        let trimmed = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && trimmed.utf16.count <= promptMaxCharacters
    }
}

/// `task.start`: a person starts a Task in a Project. The prompt is its first
/// message; the Machine defaults to the Project's default Machine, and the
/// same `requestId` answers the same Task.
public struct TaskStartInput: Encodable, Equatable, Sendable {
    public let computerID: String?
    public let model: String
    public let projectID: String
    public let prompt: String
    public let requestID: String
    public let serverID: String

    public init?(computerID: String? = nil, model: String, projectID: String, prompt: String, requestID: String, serverID: String) {
        let prompt = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard TaskText.isValidPrompt(prompt), !model.isEmpty else { return nil }
        self.computerID = computerID
        self.model = model
        self.projectID = projectID
        self.prompt = prompt
        self.requestID = requestID
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case computerID = "computerId"
        case model
        case projectID = "projectId"
        case prompt
        case requestID = "requestId"
        case serverID = "serverId"
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(computerID, forKey: .computerID)
        try container.encode(model, forKey: .model)
        try container.encode(projectID, forKey: .projectID)
        try container.encode(prompt, forKey: .prompt)
        try container.encode(requestID, forKey: .requestID)
        try container.encode(serverID, forKey: .serverID)
    }
}

/// `task.archive` and `task.unarchive`.
public struct TaskArchiveInput: Encodable, Equatable, Sendable {
    public let expectedVersion: Int
    public let serverID: String
    public let taskID: String

    public init(expectedVersion: Int, serverID: String, taskID: String) {
        self.expectedVersion = expectedVersion
        self.serverID = serverID
        self.taskID = taskID
    }

    enum CodingKeys: String, CodingKey {
        case expectedVersion
        case serverID = "serverId"
        case taskID = "taskId"
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

/// `task.update`: renaming a Task. A new title marks it custom.
public struct TaskUpdateInput: Encodable, Equatable, Sendable {
    public struct Patch: Encodable, Equatable, Sendable {
        public let title: String
    }

    public let expectedVersion: Int
    public let patch: Patch
    public let serverID: String
    public let taskID: String

    public init?(title: String, expectedVersion: Int, serverID: String, taskID: String) {
        let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard TaskText.isValidTitle(title) else { return nil }
        self.expectedVersion = expectedVersion
        self.patch = Patch(title: title)
        self.serverID = serverID
        self.taskID = taskID
    }

    enum CodingKeys: String, CodingKey {
        case expectedVersion, patch
        case serverID = "serverId"
        case taskID = "taskId"
    }
}
