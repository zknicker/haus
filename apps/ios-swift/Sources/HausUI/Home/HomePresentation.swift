import Foundation
import HausModels

/// A Captain as a mark draws it: who, and the face to show.
public struct CaptainIdentity: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let avatarURL: URL?

    public init(id: String, name: String, avatarURL: URL?) {
        self.id = id
        self.name = name
        self.avatarURL = avatarURL
    }
}

/// One Captain in Home's grid.
public struct CaptainTilePresentation: Identifiable, Hashable, Sendable {
    public let captain: CaptainIdentity
    public let isWorking: Bool
    public let isUnread: Bool
    /// Stopped, or its Device is away: the name dims.
    public let isResting: Bool

    public var id: String { captain.id }

    public init(captain: CaptainIdentity, isWorking: Bool, isUnread: Bool, isResting: Bool) {
        self.captain = captain
        self.isWorking = isWorking
        self.isUnread = isUnread
        self.isResting = isResting
    }

    /// Stopped and offline Captains rest; idle, working, and failed ones can
    /// be asked for work.
    public static func isResting(_ presence: AgentPresence) -> Bool {
        presence == .stopped || presence == .offline
    }
}

/// What leads a plain list row.
public enum HomeRowLead: Hashable, Sendable {
    case captain(CaptainIdentity)
    case person(name: String, avatarURL: URL?)
    case project(ChannelAppearance)
    case task(TaskState)
}

/// Where tapping a Home row goes.
public enum HomeRowTarget: Hashable, Sendable {
    case captain(String)
    case chat(String)
    case task(String)
}

/// A conversation or Task row: a lead, a title over one muted line, and a
/// time with the unread dot.
public struct HomeRowPresentation: Identifiable, Hashable, Sendable {
    public enum TimePlacement: Hashable, Sendable {
        /// Trailing, beside the unread dot: when the conversation last moved.
        case trailing
        /// At the end of the meta line: how long the Task has been open.
        case meta
    }

    public let id: String
    public let lead: HomeRowLead
    public let title: String
    public let subtitle: String
    /// A small mark leading the meta line: the Task's Captain.
    public let metaCaptain: CaptainIdentity?
    public let time: Date?
    public let timePlacement: TimePlacement
    public let isUnread: Bool
    public let target: HomeRowTarget
    /// The durable Chat Mark read clears. Nil when nothing is unread.
    public let markReadChatID: String?

    public init(
        id: String,
        lead: HomeRowLead,
        title: String,
        subtitle: String,
        metaCaptain: CaptainIdentity? = nil,
        time: Date?,
        timePlacement: TimePlacement = .trailing,
        isUnread: Bool,
        target: HomeRowTarget,
        markReadChatID: String? = nil
    ) {
        self.id = id
        self.lead = lead
        self.title = title
        self.subtitle = subtitle
        self.metaCaptain = metaCaptain
        self.time = time
        self.timePlacement = timePlacement
        self.isUnread = isUnread
        self.target = target
        self.markReadChatID = isUnread ? markReadChatID : nil
    }

    /// The muted line with the age appended where the row wants it.
    public func meta(now: Date) -> String {
        guard timePlacement == .meta, let time else { return subtitle }
        let age = HausCompactRelativeTime.label(for: time, now: now)
        return subtitle.isEmpty ? age : "\(subtitle) · \(age)"
    }

    public func trailingTime(now: Date) -> String? {
        guard timePlacement == .trailing, let time else { return nil }
        return HausCompactRelativeTime.label(for: time, now: now)
    }

    /// One line of a message for a row: a Project names its author, a DM
    /// speaks for itself.
    public static func preview(_ content: String, author: String?) -> String {
        let line = RichMessageParser.oneLinePreview(content)
        let text = line.isEmpty ? "Attachment" : line
        guard let author, !author.isEmpty else { return text }
        return "\(author): \(text)"
    }
}
