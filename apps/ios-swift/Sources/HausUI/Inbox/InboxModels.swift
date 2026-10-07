import Foundation
import HausModels

/// What pressing an Inbox row asks the App to open.
///
/// A row carries an id, never a resolved route: the record it projects lives on
/// the Store, and the App layer owns navigation. A Cloud Agent work names its
/// Message, which is the id its Server read is keyed by.
public enum InboxOpenRequest: Hashable, Sendable {
    /// The Agent's own Chat — its DM, which is where a person talks to it.
    case agent(String)
    case chat(String)
    case cloudAgentWork(messageID: String)
}

/// The mark every Inbox row leads with: a face, a Channel's icon box, or
/// a Cloud Agent provider glyph.
public enum InboxMark: Hashable, Sendable {
    case identity(name: String, avatarURL: URL?, presence: AgentPresence?)
    case channel(ChannelAppearance)
    /// Every Cloud row shares the provider's mark, so whether the run has
    /// started rides it as a status dot — yellow working, gray queued — the
    /// way presence rides an Agent's face.
    case cloudAgent(isRunning: Bool)
}

/// A week card's mark. Rows draw the same mark at `InboxMetrics.markSize`.
public let inboxMarkSize: CGFloat = 32

/// One unread Chat: its mark and title, the line that is waiting, and when.
/// Every row in the section is unread, so the row carries no unread flag and
/// never a count — the count stays behind in the Chat record.
public struct InboxUnreadRow: Identifiable, Hashable, Sendable {
    /// The Chat, which is also what Mark read names.
    public let id: String
    public let mark: InboxMark
    /// `#product` for a Channel, the peer's name for a DM.
    public let title: String
    public let preview: String
    public let lastActivityAt: Date?

    public init(
        id: String,
        mark: InboxMark,
        title: String,
        preview: String,
        lastActivityAt: Date?
    ) {
        self.id = id
        self.mark = mark
        self.title = title
        self.preview = preview
        self.lastActivityAt = lastActivityAt
    }
}

/// One thing running right now: what it is, how it is going, and where it
/// came from — the same two lines an Unread row spends on name, age, and the
/// waiting line.
public struct InboxHappeningNowRow: Identifiable, Hashable, Sendable {
    public let id: String
    public let mark: InboxMark
    /// The work's title, or the Agent's name.
    public let title: String
    /// Trails the title: `Running · 25m`, `Queued`, or an Agent's time in its
    /// step. It is the fact that changes while the row sits there.
    public let status: String
    /// The second line: where the work came from, or the step an Agent is on.
    public let detail: String
    public let open: InboxOpenRequest

    public init(
        id: String,
        mark: InboxMark,
        title: String,
        status: String,
        detail: String,
        open: InboxOpenRequest
    ) {
        self.id = id
        self.mark = mark
        self.title = title
        self.status = status
        self.detail = detail
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
