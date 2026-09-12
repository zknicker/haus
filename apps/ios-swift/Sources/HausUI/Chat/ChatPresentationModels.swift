import Foundation

public enum AgentPresence: String, Sendable {
    case error
    case idle
    case offline
    case stopped
    case working
}

public struct AgentPresentation: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let avatarURL: URL?
    public let presence: AgentPresence

    public init(id: String, name: String, avatarURL: URL?, presence: AgentPresence) {
        self.id = id
        self.name = name
        self.avatarURL = avatarURL
        self.presence = presence
    }
}

public enum AgentActivityState: Hashable, Sendable {
    case active
    case completed
    case failed
}

public struct AgentActivityPresentation: Identifiable, Hashable, Sendable {
    public let id: String
    public let title: String
    public let occurredAt: Date
    public let state: AgentActivityState

    public init(id: String, title: String, occurredAt: Date, state: AgentActivityState) {
        self.id = id
        self.title = title
        self.occurredAt = occurredAt
        self.state = state
    }
}

public enum ChatKind: Hashable, Sendable {
    case channel
    case agentDirectMessage(AgentPresentation)
    case humanDirectMessage(HumanPresentation)
}


public struct ChatPresentation: Identifiable, Hashable, Sendable {
    public let id: String
    public let title: String
    public let kind: ChatKind
    public let unreadCount: Int
    /// Channel-only. DMs keep their Agent avatar and ignore this.
    public let appearance: ChannelAppearance

    public init(
        id: String,
        title: String,
        kind: ChatKind,
        unreadCount: Int = 0,
        appearance: ChannelAppearance = .default
    ) {
        self.id = id
        self.title = title
        self.kind = kind
        self.unreadCount = unreadCount
        self.appearance = appearance
    }
}

public struct MessageAuthorPresentation: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let avatarURL: URL?
    public let presence: AgentPresence?

    public init(id: String, name: String, avatarURL: URL?, presence: AgentPresence? = nil) {
        self.id = id
        self.name = name
        self.avatarURL = avatarURL
        self.presence = presence
    }
}

public struct MessagePresentation: Identifiable, Hashable, Sendable {
    public let id: String
    public let author: MessageAuthorPresentation
    public let content: String
    public let createdAt: Date
    public let attachments: [MessageAttachmentPresentation]
    public let thread: ThreadPreviewPresentation?
    public let task: TaskPresentation?
    /// The Ask this Message asks, when its body is one. The marker beneath the
    /// row and the options above the answer Thread's composer both read it.
    public let ask: AskPresentation?
    public let isPending: Bool
    public let cloudAgents: [CloudAgentPresentation]
    public let threadCloudAgents: [CloudAgentPresentation]
    public let richSegments: [RichMessageSegment]
    /// What the row says with its ```visual fences taken out — the web's
    /// placement, where every text segment concatenates into one prose block
    /// above the cards.
    public let prose: String
    /// The fences this message drew, in the order it wrote them.
    public let visuals: [VisualSegment]

    public init(
        id: String,
        author: MessageAuthorPresentation,
        content: String,
        createdAt: Date,
        attachments: [MessageAttachmentPresentation] = [],
        thread: ThreadPreviewPresentation? = nil,
        task: TaskPresentation? = nil,
        ask: AskPresentation? = nil,
        isPending: Bool = false,
        cloudAgents: [CloudAgentPresentation] = [],
        threadCloudAgents: [CloudAgentPresentation] = [],
        richSegments: [RichMessageSegment]? = nil,
        visualBody: VisualMessageBody? = nil
    ) {
        // Trim consistently for Chat and Thread bodies.
        let body = Self.body(content: content)
        // Fences are split off the resolved body before anything renders it:
        // the message content IS the visual, and the prose above the cards is
        // what the text surfaces get. An adapter that needed the prose to parse
        // mentions has already split this exact body and hands the split in, so
        // the fence grammar runs once per message.
        let fenced = visualBody ?? VisualFence.body(body)
        self.id = id
        self.author = author
        self.content = body
        self.createdAt = createdAt
        self.attachments = attachments
        self.thread = thread
        self.task = task
        self.ask = ask
        self.isPending = isPending
        self.cloudAgents = cloudAgents
        self.threadCloudAgents = threadCloudAgents
        // Segments handed in were parsed from whatever body the caller resolved,
        // so they are trusted when they describe this one; a trim that changes
        // the string leaves them describing a body that no longer exists, so it
        // falls back to a parse with no identity to resolve. An adapter that can
        // resolve mentions calls `body(content:)` itself and hands both in, so a
        // trimmed body still renders its mentions as chips.
        self.prose = fenced.prose
        self.visuals = fenced.visuals
        self.richSegments = body == content
            ? richSegments ?? RichMessageParser.parse(fenced.prose) { _, _, _ in nil }
            : RichMessageParser.parse(fenced.prose) { _, _, _ in nil }
    }

    /// The resolved body together with its fence split. An adapter that needs
    /// the prose to parse mentions resolves both here and hands the split back
    /// to `init`, so the fence grammar runs once per message.
    public static func resolvedBody(content: String) -> (body: String, visuals: VisualMessageBody) {
        let resolved = body(content: content)
        return (resolved, VisualFence.body(resolved))
    }

    /// The Message body as the transcript draws it.
    ///
    /// Edge whitespace is never layout. An Agent's reply routinely ends in a
    /// newline, and a `Text` that keeps it paints a blank line under the body —
    /// a whole text line of phantom gap before the next row and before the
    /// thread card. Trimming here is presentation only; the stored Markdown is
    /// untouched, and interior blank lines stay as they were written.
    public static func body(content: String) -> String {
        content.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

public struct ThreadPreviewPresentation: Hashable, Sendable {
    public let threadChatID: String
    public let replyCount: Int
    public let unreadCount: Int
    /// The Server's own recent replies, oldest first and already capped by it.
    public let recentReplies: [ThreadReplyPresentation]

    public var latestReply: ThreadReplyPresentation? { recentReplies.last }

    public init(
        threadChatID: String,
        replyCount: Int,
        unreadCount: Int,
        recentReplies: [ThreadReplyPresentation]
    ) {
        self.threadChatID = threadChatID
        self.replyCount = replyCount
        self.unreadCount = unreadCount
        self.recentReplies = recentReplies
    }
}

public struct ThreadReplyPresentation: Identifiable, Hashable, Sendable {
    public let id: String
    public let author: MessageAuthorPresentation
    public let content: String
    public let createdAt: Date

    public init(
        id: String,
        author: MessageAuthorPresentation,
        content: String,
        createdAt: Date
    ) {
        self.id = id
        self.author = author
        self.content = content
        self.createdAt = createdAt
    }
}

public enum TaskStatusPresentation: String, Hashable, Sendable {
    case todo = "To do"
    case inProgress = "In progress"
    case inReview = "In review"
    case done = "Done"
    case closed = "Closed"
}

public struct TaskPresentation: Hashable, Sendable {
    public let number: Int
    public let status: TaskStatusPresentation
    public let assignee: MessageAuthorPresentation?
    public let creator: MessageAuthorPresentation?

    public init(
        number: Int,
        status: TaskStatusPresentation,
        assignee: MessageAuthorPresentation?,
        creator: MessageAuthorPresentation? = nil
    ) {
        self.number = number
        self.status = status
        self.assignee = assignee
        self.creator = creator
    }
}

public struct ServerPresentation: Hashable, Sendable {
    public let name: String

    public init(name: String) {
        self.name = name
    }
}
