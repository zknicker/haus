import Foundation

/// A message that references the Task: its **Mentioned in**, newest first.
public struct TaskMention: Codable, Identifiable, Hashable, Sendable {
    public let authorLabel: String
    /// The message's own Chat: a Thread's Chat for a Thread reply.
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
    /// The description as it renders, resolved by the Server when read: the
    /// bare `@handle`, `#channel`, and `#channel:shortid` tokens an Agent's
    /// Message has rewritten into references, rewritten the same way. A Server
    /// that predates it reads as the description itself.
    public private(set) var descriptionContent: String
    /// The Task references in `descriptionContent`, like a Message's `taskLinks`.
    public let descriptionTaskLinks: [TaskLink]
    public let mentions: [TaskMention]
    public let reminders: [TaskReminderRef]

    public var id: String { task.id }

    public init(
        task: BoardTask,
        descriptionContent: String? = nil,
        descriptionTaskLinks: [TaskLink] = [],
        mentions: [TaskMention],
        reminders: [TaskReminderRef]
    ) {
        self.task = task
        self.descriptionContent = descriptionContent ?? task.description
        self.descriptionTaskLinks = descriptionTaskLinks
        self.mentions = mentions
        self.reminders = reminders
    }

    /// The detail with a Task the Server just answered with. Its resolved
    /// description was read for the old text, so an edited one renders its own
    /// source until the next read; the Task links stay, since they match by text.
    public func landing(_ landed: BoardTask) -> BoardTaskDetail {
        var detail = self
        if landed.description != task.description { detail.descriptionContent = landed.description }
        detail.task = landed
        return detail
    }

    enum CodingKeys: String, CodingKey {
        case descriptionContent
        case descriptionTaskLinks
        case mentions
        case reminders
    }

    public init(from decoder: Decoder) throws {
        task = try BoardTask(from: decoder)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        descriptionContent = try container.decodeIfPresent(String.self, forKey: .descriptionContent)
            ?? task.description
        descriptionTaskLinks = try container.decodeIfPresent([TaskLink].self, forKey: .descriptionTaskLinks)
            ?? []
        mentions = try container.decode([TaskMention].self, forKey: .mentions)
        reminders = try container.decode([TaskReminderRef].self, forKey: .reminders)
    }
}
