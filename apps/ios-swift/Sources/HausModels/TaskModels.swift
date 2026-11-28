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

/// Capy's thread status, derived from the Task's session (ADR 0062): a turn
/// is running, it waits on a person or an offline Machine, its last turn
/// settled, or its last turn failed.
public enum TaskActivity: String, Codable, Hashable, Sendable {
    case working
    case waiting
    case idle
    case failed
}

/// What a Task row says about its session: its activity, or Needs you while
/// its newest message asks a person.
public enum TaskActivityStatus: Hashable, Sendable, CaseIterable {
    case needsYou
    case working
    case waiting
    case failed
    case idle

    public var label: String {
        switch self {
        case .needsYou: "Needs you"
        case .working: "Working"
        case .waiting: "Waiting"
        case .failed: "Failed"
        case .idle: "Idle"
        }
    }
}

/// A Task: one agent session with its own chat (ADR 0062). It is active or
/// archived and carries no backlog fields; Issues hold those.
public struct TaskRecord: Decodable, Identifiable, Hashable, Sendable {
    public let id: String
    /// 8 lowercase Crockford base32 characters that name the Task in URLs,
    /// branches, and the CLI.
    public let shortID: String
    public let title: String
    public let titleCustom: Bool
    public let activity: TaskActivity
    public let needsYou: Bool
    public let archivedAt: Date?
    public let agentID: String?
    public let captainID: String?
    public let chatID: String?
    public let computerID: String?
    public let model: String?
    public let origin: TaskOrigin?
    public let projectID: String
    public let serverID: String
    public let version: Int
    public let createdAt: Date
    public let updatedAt: Date
    public let createdBy: TaskActor
    public let description: String

    public init(
        id: String,
        shortID: String,
        title: String,
        titleCustom: Bool = false,
        activity: TaskActivity = .idle,
        needsYou: Bool = false,
        archivedAt: Date? = nil,
        agentID: String? = nil,
        captainID: String? = nil,
        chatID: String? = nil,
        computerID: String? = nil,
        model: String? = nil,
        origin: TaskOrigin? = nil,
        projectID: String,
        serverID: String,
        version: Int,
        createdAt: Date,
        updatedAt: Date,
        createdBy: TaskActor,
        description: String = ""
    ) {
        self.id = id
        self.shortID = shortID
        self.title = title
        self.titleCustom = titleCustom
        self.activity = activity
        self.needsYou = needsYou
        self.archivedAt = archivedAt
        self.agentID = agentID
        self.captainID = captainID
        self.chatID = chatID
        self.computerID = computerID
        self.model = model
        self.origin = origin
        self.projectID = projectID
        self.serverID = serverID
        self.version = version
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.createdBy = createdBy
        self.description = description
    }

    public var isArchived: Bool { archivedAt != nil }

    public var status: TaskActivityStatus {
        if needsYou { return .needsYou }
        return switch activity {
        case .working: .working
        case .waiting: .waiting
        case .idle: .idle
        case .failed: .failed
        }
    }

    enum CodingKeys: String, CodingKey {
        case id
        case shortID = "shortId"
        case title
        case titleCustom
        case activity
        case needsYou
        case archivedAt
        case agentID = "agentId"
        case captainID = "captainId"
        case chatID = "chatId"
        case computerID = "computerId"
        case model
        case origin
        case projectID = "projectId"
        case serverID = "serverId"
        case version
        case createdAt
        case updatedAt
        case createdBy
        case description
    }
}

/// One Task reference in a message's content, resolved when it was written:
/// an explicit `task://<taskId>` link. `text` is the exact matched substring,
/// and the content itself never changes.
public struct TaskLink: Codable, Hashable, Sendable {
    public let shortID: String
    public let taskID: String
    public let text: String

    public init(shortID: String, taskID: String, text: String) {
        self.shortID = shortID
        self.taskID = taskID
        self.text = text
    }

    enum CodingKeys: String, CodingKey {
        case shortID = "shortId"
        case taskID = "taskId"
        case text
    }
}
