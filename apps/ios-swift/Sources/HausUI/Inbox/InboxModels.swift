import Foundation
import HausModels

/// What pressing an Inbox row asks the App to open.
///
/// A row carries an id, never a resolved route: the record it projects lives on
/// the Store, and the App layer owns navigation. The Ask and the Cloud Agent
/// work both name their Message, which is the id their Server read is keyed by.
public enum InboxOpenRequest: Hashable, Sendable {
    /// The Agent's own Chat — its DM, which is where a person talks to it.
    case agent(String)
    case ask(messageID: String)
    case chat(String)
    case cloudAgentWork(messageID: String)
    /// The Task list, landing on one task when the row names one — a stalled
    /// claim names its own, the way the App's `?task=` deep link does.
    case tasks(focus: TaskFocus?)
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

/// A row in "Needs you" carries no preview. The title is already the decision
/// or the stalled claim, and on a phone a summary between it and the trailing
/// meta only truncates all three; where the row came from is the fact that
/// survives instead.
public struct InboxNeedsYouRow: Identifiable, Hashable, Sendable {
    /// Namespaced by kind: an Ask and a claim can name the same Message, so a
    /// raw Message id would collide across the two halves of the section.
    public let id: String
    public let mark: InboxMark
    public let title: String
    /// Where it came from and what kind of row it is — `Ask · #onboarding`.
    public let meta: String
    public let open: InboxOpenRequest

    public init(
        id: String,
        mark: InboxMark,
        title: String,
        meta: String,
        open: InboxOpenRequest
    ) {
        self.id = id
        self.mark = mark
        self.title = title
        self.meta = meta
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
