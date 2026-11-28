import Foundation

/// A message that references the Task: its **Mentioned in**, newest first.
public struct TaskMention: Codable, Identifiable, Hashable, Sendable {
    public let authorLabel: String
    public let chatID: String
    public let createdAt: Date
    public let excerpt: String
    public let messageID: String
    public let place: TaskMessagePlace

    public var id: String { messageID }

    enum CodingKeys: String, CodingKey {
        case authorLabel
        case chatID = "chatId"
        case createdAt
        case excerpt
        case messageID = "messageId"
        case place
    }
}

/// A Reminder set on the Task or whose description references it: its **Reminders**.
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
    public var setBy: TaskReminderSetter? = nil

    public var id: String { reminderID }

    enum CodingKeys: String, CodingKey {
        case anchorChatID = "anchorChatId"
        case kind
        case nextFireAt
        case reminderID = "reminderId"
        case title
        case setBy
    }
}

public struct TaskReminderSetter: Codable, Hashable, Sendable {
    public let agentID: String
    public let displayName: String

    public init(agentID: String, displayName: String) {
        self.agentID = agentID
        self.displayName = displayName
    }

    enum CodingKeys: String, CodingKey {
        case agentID = "agentId"
        case displayName
    }
}

/// `task.get`: the Task plus what its page shows around it, and the reader's
/// follow and unread.
public struct TaskDetail: Decodable, Identifiable, Hashable, Sendable {
    public let task: TaskRecord
    /// The description as it renders, resolved by the Server when read.
    public let descriptionContent: String
    /// The Task references in `descriptionContent`, like a Message's `taskLinks`.
    public let descriptionTaskLinks: [TaskLink]
    public let mentions: [TaskMention]
    public let reminders: [TaskReminderRef]
    public let pullRequests: [PullRequestReading]
    public let followed: Bool
    public let unreadCount: Int

    public var id: String { task.id }

    public init(
        task: TaskRecord,
        descriptionContent: String? = nil,
        descriptionTaskLinks: [TaskLink] = [],
        mentions: [TaskMention] = [],
        reminders: [TaskReminderRef] = [],
        pullRequests: [PullRequestReading] = [],
        followed: Bool = false,
        unreadCount: Int = 0
    ) {
        self.task = task
        self.descriptionContent = descriptionContent ?? task.description
        self.descriptionTaskLinks = descriptionTaskLinks
        self.mentions = mentions
        self.reminders = reminders
        self.pullRequests = pullRequests
        self.followed = followed
        self.unreadCount = unreadCount
    }

    enum CodingKeys: String, CodingKey {
        case descriptionContent
        case descriptionTaskLinks
        case mentions
        case reminders
        case pullRequests
        case followed
        case unreadCount
    }

    public init(from decoder: Decoder) throws {
        task = try TaskRecord(from: decoder)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        descriptionContent = try container.decode(String.self, forKey: .descriptionContent)
        descriptionTaskLinks = try container.decodeLossyArray(TaskLink.self, forKey: .descriptionTaskLinks)
        mentions = try container.decodeLossyArray(TaskMention.self, forKey: .mentions)
        reminders = try container.decodeLossyArray(TaskReminderRef.self, forKey: .reminders)
        pullRequests = try container.decodeLossyArray(PullRequestReading.self, forKey: .pullRequests)
        followed = try container.decode(Bool.self, forKey: .followed)
        unreadCount = try container.decode(Int.self, forKey: .unreadCount)
    }

    public func replacing(task: TaskRecord? = nil, followed: Bool? = nil) -> TaskDetail {
        let task = task ?? self.task
        let sameDescription = task.description == self.task.description
        return TaskDetail(
            task: task,
            descriptionContent: sameDescription ? descriptionContent : nil,
            descriptionTaskLinks: sameDescription ? descriptionTaskLinks : [],
            mentions: mentions,
            reminders: reminders,
            pullRequests: pullRequests,
            followed: followed ?? self.followed,
            unreadCount: unreadCount
        )
    }
}
