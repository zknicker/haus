import Foundation

/// A person or an Agent of the Server: a Task's creator, assignee, or assigner.
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

/// A standalone work item on a board (ADR 0051), distinct from a claim, which
/// is the Agent-only lock on a message. Named `BoardTask` because `Task` is
/// Swift Concurrency's.
public struct BoardTask: Codable, Identifiable, Hashable, Sendable {
    public let assignee: TaskActor?
    public let boardID: String
    /// The category of `columnID`'s column, derived when read.
    public let category: ColumnCategory
    public let columnID: String
    /// Set while the Task sits in a `done` or `canceled` column.
    public let completedAt: Date?
    public let createdAt: Date
    public let createdBy: TaskActor
    public let description: String
    /// `YYYY-MM-DD`, a calendar day: display only, it sorts and badges and
    /// wakes nothing. See `TaskDueDate`.
    public let dueOn: String?
    public let id: String
    /// `SEC-12`, derived when read, so re-keying a board re-keys its Tasks.
    public let key: String
    public let labelIDs: [String]
    public let number: Int
    public let priority: TaskPriority
    public let serverID: String
    public let title: String
    public let updatedAt: Date
    public let version: Int

    public init(
        assignee: TaskActor?,
        boardID: String,
        category: ColumnCategory,
        columnID: String,
        completedAt: Date?,
        createdAt: Date,
        createdBy: TaskActor,
        description: String,
        dueOn: String?,
        id: String,
        key: String,
        labelIDs: [String],
        number: Int,
        priority: TaskPriority,
        serverID: String,
        title: String,
        updatedAt: Date,
        version: Int
    ) {
        self.assignee = assignee
        self.boardID = boardID
        self.category = category
        self.columnID = columnID
        self.completedAt = completedAt
        self.createdAt = createdAt
        self.createdBy = createdBy
        self.description = description
        self.dueOn = dueOn
        self.id = id
        self.key = key
        self.labelIDs = labelIDs
        self.number = number
        self.priority = priority
        self.serverID = serverID
        self.title = title
        self.updatedAt = updatedAt
        self.version = version
    }

    enum CodingKeys: String, CodingKey {
        case assignee
        case boardID = "boardId"
        case category
        case columnID = "columnId"
        case completedAt
        case createdAt
        case createdBy
        case description
        case dueOn
        case id
        case key
        case labelIDs = "labelIds"
        case number
        case priority
        case serverID = "serverId"
        case title
        case updatedAt
        case version
    }

    /// The same Task shown in another column while a move settles. App-local:
    /// `version` stays the Server's, and the receipt replaces this value.
    public func moved(to column: BoardColumn) -> BoardTask {
        BoardTask(
            assignee: assignee,
            boardID: boardID,
            category: column.category,
            columnID: column.id,
            completedAt: column.category.isClosed ? completedAt ?? updatedAt : nil,
            createdAt: createdAt,
            createdBy: createdBy,
            description: description,
            dueOn: dueOn,
            id: id,
            key: key,
            labelIDs: labelIDs,
            number: number,
            priority: priority,
            serverID: serverID,
            title: title,
            updatedAt: updatedAt,
            version: version
        )
    }
}

/// A message that references the Task: its **Mentioned in**, newest first.
public struct TaskMention: Codable, Identifiable, Hashable, Sendable {
    public let authorLabel: String
    /// The message's own Chat: a Thread's Chat for a Thread reply.
    public let chatID: String
    public let createdAt: Date
    public let excerpt: String
    public let messageID: String
    /// The Thread's anchor when the message is a Thread reply; nil otherwise.
    public let threadAnchorMessageID: String?

    public var id: String { messageID }

    enum CodingKeys: String, CodingKey {
        case authorLabel
        case chatID = "chatId"
        case createdAt
        case excerpt
        case messageID = "messageId"
        case threadAnchorMessageID = "threadAnchorMessageId"
    }
}

/// A Reminder whose description references the Task: its **Reminders**.
public struct TaskReminderRef: Codable, Identifiable, Hashable, Sendable {
    public enum Kind: String, Codable, Sendable {
        case once
        case recurring
    }

    public let anchorChatID: String
    public let kind: Kind
    /// Nil once a one-shot fired or the Reminder was canceled.
    public let nextFireAt: Date?
    public let reminderID: String
    public let title: String

    public var id: String { reminderID }

    enum CodingKeys: String, CodingKey {
        case anchorChatID = "anchorChatId"
        case kind
        case nextFireAt
        case reminderID = "reminderId"
        case title
    }
}

/// `task.get`: the Task's fields flat beside `mentions` and `reminders`.
public struct BoardTaskDetail: Decodable, Identifiable, Hashable, Sendable {
    public var task: BoardTask
    public let mentions: [TaskMention]
    public let reminders: [TaskReminderRef]

    public var id: String { task.id }

    public init(task: BoardTask, mentions: [TaskMention], reminders: [TaskReminderRef]) {
        self.task = task
        self.mentions = mentions
        self.reminders = reminders
    }

    enum CodingKeys: String, CodingKey {
        case mentions
        case reminders
    }

    public init(from decoder: Decoder) throws {
        task = try BoardTask(from: decoder)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        mentions = try container.decode([TaskMention].self, forKey: .mentions)
        reminders = try container.decode([TaskReminderRef].self, forKey: .reminders)
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
    /// Most pressing first, the order a person picks from and a board sorts by.
    static let ordered: [TaskPriority] = [.urgent, .high, .medium, .low, .none]

    var displayName: String {
        switch self {
        case .none: "No priority"
        case .urgent: "Urgent"
        case .high: "High"
        case .medium: "Medium"
        case .low: "Low"
        }
    }

    /// Sorts `none` after `low`: an unset priority is not a low one, but it
    /// is the least known about.
    var sortRank: Int {
        switch self {
        case .urgent: 0
        case .high: 1
        case .medium: 2
        case .low: 3
        case .none: 4
        }
    }
}
