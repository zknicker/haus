import Foundation

public enum TaskActor: Codable, Hashable, Sendable {
    case user(userID: String)
    case agent(agentID: String)

    public var userID: String? {
        if case .user(let userID) = self { userID } else { nil }
    }

    public var agentID: String? {
        if case .agent(let agentID) = self { agentID } else { nil }
    }

    enum CodingKeys: String, CodingKey {
        case agentID = "agentId"
        case kind
        case userID = "userId"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .kind) {
        case "user":
            self = .user(userID: try container.decode(String.self, forKey: .userID))
        case "agent":
            self = .agent(agentID: try container.decode(String.self, forKey: .agentID))
        case let kind:
            throw DecodingError.dataCorruptedError(
                forKey: .kind,
                in: container,
                debugDescription: "Unknown Task actor kind \(kind)"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .user(let userID):
            try container.encode("user", forKey: .kind)
            try container.encode(userID, forKey: .userID)
        case .agent(let agentID):
            try container.encode("agent", forKey: .kind)
            try container.encode(agentID, forKey: .agentID)
        }
    }
}

///
public struct TaskRecord: Decodable, Identifiable, Hashable, Sendable {
    public let id: String
    public let key: String
    public let title: String
    public let state: TaskState
    public let chatID: String?
    public let origin: TaskOrigin?
    public let serverID: String
    public let version: Int
    public let createdAt: Date
    public let updatedAt: Date
    public let completedAt: Date?
    public let description: String
    public let createdBy: TaskActor?
    public let assignee: TaskActor?
    public let priority: TaskPriority
    public let dueOn: String?
    public let labelIDs: [String]
    public let projectID: String?
    public let keyID: String?
    public let number: Int?

    public init(
        id: String,
        key: String,
        title: String,
        state: TaskState,
        chatID: String? = nil,
        origin: TaskOrigin? = nil,
        serverID: String,
        version: Int,
        createdAt: Date,
        updatedAt: Date,
        completedAt: Date? = nil,
        description: String = "",
        createdBy: TaskActor? = nil,
        assignee: TaskActor? = nil,
        priority: TaskPriority = .none,
        dueOn: String? = nil,
        labelIDs: [String] = [],
        projectID: String? = nil,
        keyID: String? = nil,
        number: Int? = nil
    ) {
        self.id = id
        self.key = key
        self.title = title
        self.state = state
        self.chatID = chatID
        self.origin = origin
        self.serverID = serverID
        self.version = version
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.completedAt = completedAt
        self.description = description
        self.createdBy = createdBy
        self.assignee = assignee
        self.priority = priority
        self.dueOn = dueOn
        self.labelIDs = labelIDs
        self.projectID = projectID
        self.keyID = keyID
        self.number = number
    }

    enum CodingKeys: String, CodingKey {
        case id
        case key
        case title
        case state
        case chatID = "chatId"
        case origin
        case serverID = "serverId"
        case version
        case createdAt
        case updatedAt
        case completedAt
        case description
        case createdBy
        case assignee
        case priority
        case dueOn
        case labelIDs = "labelIds"
        case projectID = "projectId"
        case keyID = "keyId"
        case number
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        key = try container.decode(String.self, forKey: .key)
        title = try container.decode(String.self, forKey: .title)
        state = try container.decode(TaskState.self, forKey: .state)
        chatID = try container.decodeIfPresent(String.self, forKey: .chatID)
        origin = try? container.decodeIfPresent(TaskOrigin.self, forKey: .origin)
        serverID = try container.decode(String.self, forKey: .serverID)
        version = try container.decode(Int.self, forKey: .version)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
        completedAt = try container.decodeIfPresent(Date.self, forKey: .completedAt)
        description = try container.decodeIfPresent(String.self, forKey: .description) ?? ""
        createdBy = try? container.decodeIfPresent(TaskActor.self, forKey: .createdBy)
        assignee = try? container.decodeIfPresent(TaskActor.self, forKey: .assignee)
        priority = (try? container.decodeIfPresent(TaskPriority.self, forKey: .priority)) ?? TaskPriority.none
        dueOn = try container.decodeIfPresent(String.self, forKey: .dueOn)
        labelIDs = (try? container.decodeIfPresent([String].self, forKey: .labelIDs)) ?? []
        projectID = try container.decodeIfPresent(String.self, forKey: .projectID)
        keyID = try container.decodeIfPresent(String.self, forKey: .keyID)
        number = try container.decodeIfPresent(Int.self, forKey: .number)
    }
}

/// One Task reference in a message's content, resolved when it was written: an
/// explicit `task://<taskId>` link or a bare key. `text` is the exact matched
/// substring, and the content itself never changes.
public struct TaskLink: Codable, Hashable, Sendable {
    public let key: String
    public let taskID: String
    public let text: String

    public init(key: String, taskID: String, text: String) {
        self.key = key
        self.taskID = taskID
        self.text = text
    }

    enum CodingKeys: String, CodingKey {
        case key
        case taskID = "taskId"
        case text
    }
}

public extension TaskPriority {
    var displayName: String {
        switch self {
        case .none: "No priority"
        case .urgent: "Urgent"
        case .high: "High"
        case .medium: "Medium"
        case .low: "Low"
        }
    }
}
