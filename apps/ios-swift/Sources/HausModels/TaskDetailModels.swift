import Foundation

/// A message that references the Task: its **Mentioned in**, newest first.
public struct TaskMention: Codable, Identifiable, Hashable, Sendable {
    public let authorLabel: String
    /// The message's own Chat.
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
    /// The Agent that set it. Nil from a Server that predates the field.
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

/// `task.get`: the Task's fields flat beside `mentions`, `reminders`, and what
/// ADR 0053 attaches to a Task as a place.
public struct TaskDetail: Decodable, Identifiable, Hashable, Sendable {
    public let task: TaskRecord
    /// The description as it renders, resolved by the Server when read: the
    /// bare `@handle`, `#channel`, and `#channel:shortid` tokens an Agent's
    /// Message has rewritten into references, rewritten the same way. A Server
    /// that predates it reads as the description itself.
    public let descriptionContent: String
    /// The Task references in `descriptionContent`, like a Message's `taskLinks`.
    public let descriptionTaskLinks: [TaskLink]
    public let mentions: [TaskMention]
    public let reminders: [TaskReminderRef]
    /// Cloud Agent work attached to the Task, newest first (ADR 0053 decision 6).
    /// A work this build cannot read drops itself rather than the Task.
    public let attachedWork: [CloudAgentWork]
    /// Pull requests attached to the Task, as the Server last read them.
    public let pullRequests: [CloudAgentPullRequestReading]
    /// Whether the viewer follows the Task, so it can be unread for them.
    public let followed: Bool
    /// The viewer's unread messages in the Task's Chat; zero unless followed.
    public let unreadCount: Int

    public var id: String { task.id }

    public init(
        task: TaskRecord,
        descriptionContent: String? = nil,
        descriptionTaskLinks: [TaskLink] = [],
        mentions: [TaskMention],
        reminders: [TaskReminderRef],
        attachedWork: [CloudAgentWork] = [],
        pullRequests: [CloudAgentPullRequestReading] = [],
        followed: Bool = false,
        unreadCount: Int = 0
    ) {
        self.task = task
        self.descriptionContent = descriptionContent ?? task.description
        self.descriptionTaskLinks = descriptionTaskLinks
        self.mentions = mentions
        self.reminders = reminders
        self.attachedWork = attachedWork
        self.pullRequests = pullRequests
        self.followed = followed
        self.unreadCount = unreadCount
    }

    enum CodingKeys: String, CodingKey {
        case descriptionContent
        case descriptionTaskLinks
        case mentions
        case reminders
        case attachedWork
        case pullRequests
        case followed
        case unreadCount
    }

    public init(from decoder: Decoder) throws {
        task = try TaskRecord(from: decoder)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        descriptionContent = try container.decodeIfPresent(String.self, forKey: .descriptionContent)
            ?? task.description
        descriptionTaskLinks = try container.decodeLossyArray(TaskLink.self, forKey: .descriptionTaskLinks)
        mentions = try container.decodeLossyArray(TaskMention.self, forKey: .mentions)
        reminders = try container.decodeLossyArray(TaskReminderRef.self, forKey: .reminders)
        attachedWork = try container.decodeLossyArray(CloudAgentWork.self, forKey: .attachedWork)
        pullRequests = try container.decodeLossyArray(CloudAgentPullRequestReading.self, forKey: .pullRequests)
        followed = try container.decodeIfPresent(Bool.self, forKey: .followed) ?? false
        unreadCount = try container.decodeIfPresent(Int.self, forKey: .unreadCount) ?? 0
    }
}
