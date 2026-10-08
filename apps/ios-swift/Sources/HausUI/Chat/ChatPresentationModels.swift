import Foundation
import HausModels

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

/// The compact parent snapshot shown above an inline reply. It is intentionally
/// a presentation value: the Server's reply reference has already resolved its
/// author against the same directory snapshot used by the message row.
public struct MessageReplyReferencePresentation: Identifiable, Hashable, Sendable {
    public let id: String
    public let author: MessageAuthorPresentation
    public let content: String
    public let createdAt: Date
    public let sequence: Int?

    public init(
        id: String,
        author: MessageAuthorPresentation,
        content: String,
        createdAt: Date,
        sequence: Int? = nil
    ) {
        self.id = id
        self.author = author
        self.content = content
        self.createdAt = createdAt
        self.sequence = sequence
    }

    /// One line of the parent, read the way the App's `messagePreviewLine` reads it.
    public var excerpt: String {
        let line = RichMessageParser.oneLinePreview(content)
        return line.isEmpty ? "Attachment" : line
    }
}

public struct MessagePresentation: Identifiable, Hashable, Sendable {
    public let id: String
    public let author: MessageAuthorPresentation
    public let content: String
    public let createdAt: Date
    /// The Server sequence is available for durable Chat rows and lets a
    /// parent jump stop paging as soon as the referenced history range has
    /// been exhausted. Synthetic rows leave it nil.
    public let sequence: Int?
    public let attachments: [MessageAttachmentPresentation]
    /// The direct parent context for an inline reply, when this message was
    /// posted in a Channel or DM as a reply to another message.
    public let inlineReply: MessageReplyReferencePresentation?
    public let thread: ThreadPreviewPresentation?
    public let task: TaskPresentation?
    public let isPending: Bool
    /// A pending row whose send did not reach Server: the viewer's own row,
    /// marked "Not sent", until they retry or delete it.
    public let isSendFailed: Bool
    public let cloudAgents: [CloudAgentPresentation]
    public let threadCloudAgents: [CloudAgentPresentation]
    /// Grouped emoji reactions in the Server's order, reactors resolved.
    public let reactions: [MessageReactionPresentation]
    /// What the row draws: the prose read as Markdown blocks.
    public let richBlocks: [RichMessageBlock]
    /// What the row says with its ```visual fences taken out — the web's
    /// placement, where every text segment concatenates into one prose block
    /// above the cards.
    public let prose: String
    /// The fences this message drew, in the order it wrote them.
    public let visuals: [VisualSegment]
    /// The workspace pages this message linked with ```artifact fences.
    public let artifacts: [ArtifactSegment]
    /// The Reminder or Trigger fire this message answers, when it answers one.
    public let cause: MessageCausePresentation?

    public init(
        id: String,
        author: MessageAuthorPresentation,
        content: String,
        createdAt: Date,
        attachments: [MessageAttachmentPresentation] = [],
        sequence: Int? = nil,
        inlineReply: MessageReplyReferencePresentation? = nil,
        thread: ThreadPreviewPresentation? = nil,
        task: TaskPresentation? = nil,
        isPending: Bool = false,
        isSendFailed: Bool = false,
        cloudAgents: [CloudAgentPresentation] = [],
        threadCloudAgents: [CloudAgentPresentation] = [],
        reactions: [MessageReactionPresentation] = [],
        richBlocks: [RichMessageBlock]? = nil,
        visualBody: VisualMessageBody? = nil,
        cause: MessageCausePresentation? = nil
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
        self.sequence = sequence
        self.inlineReply = inlineReply
        self.thread = thread
        self.task = task
        self.isPending = isPending
        self.isSendFailed = isPending && isSendFailed
        self.cloudAgents = cloudAgents
        self.threadCloudAgents = threadCloudAgents
        self.reactions = reactions
        // Blocks handed in were parsed from whatever body the caller resolved,
        // so they are trusted when they describe this one; a trim that changes
        // the string leaves them describing a body that no longer exists, so it
        // falls back to a parse with no identity to resolve. An adapter that can
        // resolve mentions calls `body(content:)` itself and hands both in, so a
        // trimmed body still renders its mentions as chips.
        self.prose = fenced.prose
        self.visuals = fenced.visuals
        self.artifacts = fenced.artifacts
        self.cause = cause
        self.richBlocks = body == content
            ? richBlocks ?? RichMessageBlockParser.blocks(fenced.prose) { _, _, _ in nil }
            : RichMessageBlockParser.blocks(fenced.prose) { _, _, _ in nil }
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

public struct ServerPresentation: Hashable, Sendable {
    public let name: String

    public init(name: String) {
        self.name = name
    }
}
