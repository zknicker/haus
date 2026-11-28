import Foundation

/// One mark in a list column's rail: what it opens, how it reads to
/// VoiceOver, the mark it draws, its dot, and whether the detail shows it.
public struct ListRailItem<Target: Hashable & Sendable>: Identifiable, Hashable, Sendable {
    public enum Mark: Hashable, Sendable {
        case captain(CaptainIdentity)
        case person(name: String, avatarURL: URL?)
        case project(ChannelAppearance)
        case task(TaskDiscState)
        case icon(HausIconName)
    }

    /// Unread is the accent dot. A Captain or Task at work is the green one.
    public enum Badge: Hashable, Sendable {
        case unread
        case working
    }

    public let target: Target
    public let label: String
    public let mark: Mark
    public let badge: Badge?
    public let isSelected: Bool

    public var id: Target { target }

    public init(target: Target, label: String, mark: Mark, badge: Badge? = nil, isSelected: Bool) {
        self.target = target
        self.label = label
        self.mark = mark
        self.badge = badge
        self.isSelected = isSelected
    }

    /// Unread wins: it asks the reader to look, while work is already moving.
    static func badge(isUnread: Bool, isWorking: Bool) -> Badge? {
        if isUnread { return .unread }
        return isWorking ? .working : nil
    }
}
