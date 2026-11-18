import Foundation

/// The Server's live reading of a pull request attached to a Task
/// (`cloudAgentPullRequestReadingSchema`). It stays evidence: Haus never acts on
/// the pull request. Its rollups stay strings so a state this build does not
/// know reads as plain words rather than failing the Task read.
public struct CloudAgentPullRequestReading: Codable, Identifiable, Hashable, Sendable {
    public let number: Int
    public let repository: String
    /// `open`, `merged`, `closed`, or `draft` as GitHub or the Run reported it.
    public let state: String
    /// `none`, `pending`, `passing`, `failing`, or `unknown`.
    public let checks: String
    /// `none`, `approved`, `changes-requested`, or `unknown`.
    public let review: String
    /// Nil until GitHub is read: a Run's snapshot carries no title.
    public let title: String?
    public let url: String
    public let additions: Int
    public let deletions: Int
    public let changedFiles: Int
    public let observedAt: Date?
    public let settledAt: Date?

    public var id: String { "\(repository)#\(number)" }

    public init(
        number: Int,
        repository: String,
        state: String,
        checks: String = "unknown",
        review: String = "unknown",
        title: String? = nil,
        url: String,
        additions: Int = 0,
        deletions: Int = 0,
        changedFiles: Int = 0,
        observedAt: Date? = nil,
        settledAt: Date? = nil
    ) {
        self.number = number
        self.repository = repository
        self.state = state
        self.checks = checks
        self.review = review
        self.title = title
        self.url = url
        self.additions = additions
        self.deletions = deletions
        self.changedFiles = changedFiles
        self.observedAt = observedAt
        self.settledAt = settledAt
    }

    enum CodingKeys: String, CodingKey {
        case number, repository, state, checks, review, title, url
        case additions, deletions, changedFiles, observedAt, settledAt
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        number = try container.decode(Int.self, forKey: .number)
        repository = try container.decode(String.self, forKey: .repository)
        state = try container.decode(String.self, forKey: .state)
        checks = try container.decodeIfPresent(String.self, forKey: .checks) ?? "unknown"
        review = try container.decodeIfPresent(String.self, forKey: .review) ?? "unknown"
        title = try container.decodeIfPresent(String.self, forKey: .title)
        url = try container.decode(String.self, forKey: .url)
        additions = try container.decodeIfPresent(Int.self, forKey: .additions) ?? 0
        deletions = try container.decodeIfPresent(Int.self, forKey: .deletions) ?? 0
        changedFiles = try container.decodeIfPresent(Int.self, forKey: .changedFiles) ?? 0
        observedAt = try container.decodeIfPresent(Date.self, forKey: .observedAt)
        settledAt = try container.decodeIfPresent(Date.self, forKey: .settledAt)
    }
}

/// The Agent that set a Task's Reminder; a retired Agent keeps its stored name.
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

/// What an unread Task row names beyond its messages (`chatUnreadPreviewTaskSchema`).
public struct ChatUnreadPreviewTask: Codable, Hashable, Sendable {
    public let taskID: String
    public let key: String
    public let title: String
    public let state: TaskState
    /// The Channel the Task started in.
    public let originChatID: String

    public init(taskID: String, key: String, title: String, state: TaskState, originChatID: String) {
        self.taskID = taskID
        self.key = key
        self.title = title
        self.state = state
        self.originChatID = originChatID
    }

    enum CodingKeys: String, CodingKey {
        case taskID = "taskId"
        case key
        case title
        case state
        case originChatID = "originChatId"
    }
}

/// One unread row's newest counted messages, oldest first (`chat.unreadPreviews`).
/// Set `task` marks a followed Task's row: `chatID` is then the Task's own Chat.
public struct ChatUnreadPreview: Decodable, Equatable, Sendable {
    public let chatID: String
    public let earlierUnreadCount: Int
    public let messages: [ChatMessage]
    public let task: ChatUnreadPreviewTask?

    public init(chatID: String, earlierUnreadCount: Int, messages: [ChatMessage], task: ChatUnreadPreviewTask?) {
        self.chatID = chatID
        self.earlierUnreadCount = earlierUnreadCount
        self.messages = messages
        self.task = task
    }

    /// The unread messages the row stands for: those it quotes and those before.
    public var unreadCount: Int { earlierUnreadCount + messages.count }

    enum CodingKeys: String, CodingKey {
        case chatID = "chatId"
        case earlierUnreadCount
        case messages
        case task
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        chatID = try container.decode(String.self, forKey: .chatID)
        earlierUnreadCount = try container.decodeIfPresent(Int.self, forKey: .earlierUnreadCount) ?? 0
        messages = try container.decodeLossyArray(ChatMessage.self, forKey: .messages)
        task = try container.decodeIfPresent(ChatUnreadPreviewTask.self, forKey: .task)
    }
}

/// `chat.unreadPreviews`: every unread row's preview on one Server. A row this
/// build cannot read is dropped rather than failing the whole Inbox.
public struct ChatUnreadPreviewList: Decodable, Sendable, Equatable {
    public let previews: [ChatUnreadPreview]

    public init(previews: [ChatUnreadPreview]) {
        self.previews = previews
    }

    enum CodingKeys: String, CodingKey {
        case previews
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        previews = try container.decodeLossyArray(ChatUnreadPreview.self, forKey: .previews)
    }

    /// The followed unread Tasks among the rows, newest activity first as the
    /// Server ordered them. Channel and DM rows are the Chat list's to show.
    public var taskPreviews: [ChatUnreadPreview] {
        previews.filter { $0.task != nil && $0.unreadCount > 0 }
    }
}
