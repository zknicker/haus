import Foundation
import HausModels

/// What pressing an Inbox row asks the App to open.
///
/// A row carries an id, never a resolved route: the record it projects lives on
/// the Store, and the App layer owns navigation. A Cloud Agent work names its
/// Message and a Needs you Thread row its Thread's Chat, which is the id each
/// Server read is keyed by.
public enum InboxOpenRequest: Hashable, Sendable {
    /// The Agent's own Chat — its DM, which is where a person talks to it.
    case agent(String)
    case chat(String)
    case cloudAgentWork(messageID: String)
    /// A Needs you row on a Thread, by the Thread's own Chat id. The App
    /// resolves the anchor and pushes that Thread.
    case needsYouThread(chatID: String)
}

/// The 32pt mark every Inbox row leads with: a face, a Channel's icon box, or
/// a Cloud Agent provider glyph.
public enum InboxMark: Hashable, Sendable {
    case identity(name: String, avatarURL: URL?, presence: AgentPresence?)
    case channel(ChannelAppearance)
    case cloudAgent
}

/// Every Inbox mark is this size, Agent, Channel, or week card alike.
public let inboxMarkSize: CGFloat = 32

/// A conversation addressed to the reader (ADR 0037): the addressing author's
/// face and name, the line they wrote, and where and when — a mention reads
/// `#onboarding · 2m`, a DM its time alone.
public struct InboxNeedsYouRow: Identifiable, Hashable, Sendable {
    /// The Chat holding the addressing messages, which is also what Done names.
    public let id: String
    public let mark: InboxMark
    /// Who addressed the reader.
    public let title: String
    /// What they wrote, on one line.
    public let preview: String
    /// Where it came from: `#onboarding` for a mention, nil for a DM, whose
    /// face already says where.
    public let context: String?
    public let latestAt: Date
    public let open: InboxOpenRequest

    public init(
        id: String,
        mark: InboxMark,
        title: String,
        preview: String,
        context: String?,
        latestAt: Date,
        open: InboxOpenRequest
    ) {
        self.id = id
        self.mark = mark
        self.title = title
        self.preview = preview
        self.context = context
        self.latestAt = latestAt
        self.open = open
    }
}

public struct InboxConversationRow: Identifiable, Hashable, Sendable {
    public let id: String
    public let mark: InboxMark
    /// `#product` for a Channel, the peer's name for a DM.
    public let title: String
    public let preview: String
    public let lastActivityAt: Date?
    /// Whether the row is waiting on the reader. The phone marks that with a
    /// dot and never a number, so the count stays behind in the Chat record.
    public let isUnread: Bool

    public init(
        id: String,
        mark: InboxMark,
        title: String,
        preview: String,
        lastActivityAt: Date?,
        isUnread: Bool
    ) {
        self.id = id
        self.mark = mark
        self.title = title
        self.preview = preview
        self.lastActivityAt = lastActivityAt
        self.isUnread = isUnread
    }
}

public struct InboxHappeningNowRow: Identifiable, Hashable, Sendable {
    public let id: String
    public let mark: InboxMark
    public let title: String
    public let preview: String
    /// The trailing status — `Running · 25m`. An Agent in a turn states its
    /// step as the preview instead, so it carries none.
    public let meta: String?
    public let open: InboxOpenRequest

    public init(
        id: String,
        mark: InboxMark,
        title: String,
        preview: String,
        meta: String?,
        open: InboxOpenRequest
    ) {
        self.id = id
        self.mark = mark
        self.title = title
        self.preview = preview
        self.meta = meta
        self.open = open
    }
}

/// One Agent's week as the "Active this week" strip reads it.
public struct InboxAgentWeek: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let avatarURL: URL?
    public let presence: AgentPresence?
    /// Processed tokens per UTC day, oldest first — the sparkline's series.
    public let days: [Int]
    public let totalTokens: Int
    /// The step it is on right now, or nil when it is between turns.
    public let activityLabel: String?

    public init(
        id: String,
        name: String,
        avatarURL: URL?,
        presence: AgentPresence?,
        days: [Int],
        totalTokens: Int,
        activityLabel: String?
    ) {
        self.id = id
        self.name = name
        self.avatarURL = avatarURL
        self.presence = presence
        self.days = days
        self.totalTokens = totalTokens
        self.activityLabel = activityLabel
    }

    public var isLive: Bool { activityLabel != nil }

    /// The line under the figure. A working Agent spends it on the step it is
    /// on, which is the more perishable fact; every other card states what the
    /// figure counts, because a bare number on a card is a riddle.
    public var unit: String {
        activityLabel ?? "Tokens · \(AgentTokenUsage.inboxWindowDays)d"
    }
}
