import Foundation

/// One Project in the Projects tab: its icon, name, Captains, open Task
/// count, when it last moved, and whether anything is unread.
public struct ProjectRowPresentation: Identifiable, Hashable, Sendable {
    public let chatID: String
    public let name: String
    public let appearance: ChannelAppearance
    public let isAll: Bool
    public let captains: [CaptainIdentity]
    /// Nil until `task.listOpen` and `project.list` have both landed.
    public let openTaskCount: Int?
    public let lastActivityAt: Date?
    public let isUnread: Bool
    /// The Project behind the Chat, once `project.list` has landed. Settings
    /// need it.
    public let projectID: String?

    public var id: String { chatID }

    public init(
        chatID: String,
        name: String,
        appearance: ChannelAppearance,
        isAll: Bool,
        captains: [CaptainIdentity],
        openTaskCount: Int?,
        lastActivityAt: Date?,
        isUnread: Bool,
        projectID: String?
    ) {
        self.chatID = chatID
        self.name = name
        self.appearance = appearance
        self.isAll = isAll
        self.captains = captains
        self.openTaskCount = openTaskCount
        self.lastActivityAt = lastActivityAt
        self.isUnread = isUnread
        self.projectID = projectID
    }

    /// The muted line under the name. `#all` says who is in it; a Project
    /// counts its open Tasks once the count is known.
    public var meta: String? {
        if isAll { return "Everyone on this Server" }
        return openTaskCount.map { count in
            switch count {
            case 0: "No open tasks"
            case 1: "1 open task"
            default: "\(count) open tasks"
            }
        }
    }
}

/// One person in the People section: a DM with them.
public struct PersonRowPresentation: Identifiable, Hashable, Sendable {
    public let chatID: String
    public let name: String
    public let avatarURL: URL?
    public let isUnread: Bool

    public var id: String { chatID }

    public init(chatID: String, name: String, avatarURL: URL?, isUnread: Bool) {
        self.chatID = chatID
        self.name = name
        self.avatarURL = avatarURL
        self.isUnread = isUnread
    }
}

/// Which Projects the list shows: the "Joined ⌄" chip's scope, narrowed by
/// an optional Captain from "+ Filter".
public struct ProjectsFilter: Hashable, Sendable {
    public enum Scope: String, CaseIterable, Hashable, Sendable {
        case joined = "Joined"
        case unread = "Unread"
    }

    public var scope: Scope = .joined
    public var captainID: String?

    public init(scope: Scope = .joined, captainID: String? = nil) {
        self.scope = scope
        self.captainID = captainID
    }

    /// `#all` stays last and ignores the Captain filter: everyone is in it.
    public func apply(_ rows: [ProjectRowPresentation]) -> [ProjectRowPresentation] {
        let shown = rows.filter { row in
            guard scope == .joined || row.isUnread else { return false }
            guard let captainID, !row.isAll else { return true }
            return row.captains.contains { $0.id == captainID }
        }
        return shown.filter { !$0.isAll } + shown.filter(\.isAll)
    }

    public var isNarrowed: Bool {
        scope != .joined || captainID != nil
    }
}
