import Foundation

/// The Server facts a message body's reference chips resolve against: Agent
/// and member names and avatars, and channel names and appearance.
///
/// Presence, unread counts, last messages, and every other field that churns
/// with ordinary traffic are deliberately absent, so a parsed body is retired
/// only when a chip it could draw would actually change.
public struct ReferenceDirectory: Equatable, Sendable {
    private struct AgentFacts: Equatable, Sendable {
        let id: String
        let displayName: String
        let avatarURL: String?
    }

    private struct MemberFacts: Equatable, Sendable {
        let userID: String
        let displayName: String?
        let handle: String?
        let avatarURL: String?
    }

    private struct ChatFacts: Equatable, Sendable {
        let id: String
        let name: String?
        let icon: String?
        let color: String?
    }

    private var agents: [AgentFacts] = []
    private var members: [MemberFacts] = []
    private var chats: [ChatFacts] = []

    public init() {}

    /// Each update returns whether the chip-visible facts changed.
    public mutating func update(agents list: [AgentSummary]) -> Bool {
        let next = list
            .map { AgentFacts(id: $0.id, displayName: $0.displayName, avatarURL: $0.avatarURL) }
            .sorted { $0.id < $1.id }
        guard next != agents else { return false }
        agents = next
        return true
    }

    public mutating func update(members list: [MemberSummary]) -> Bool {
        let next = list
            .map {
                MemberFacts(userID: $0.userID, displayName: $0.displayName, handle: $0.handle, avatarURL: $0.avatarURL)
            }
            .sorted { $0.userID < $1.userID }
        guard next != members else { return false }
        members = next
        return true
    }

    public mutating func update(chats list: [ChatSummary]) -> Bool {
        // Sorted so a Chat list that only reorders — every new message moves
        // its Chat to the top — reads as unchanged.
        let next = list
            .map { ChatFacts(id: $0.id, name: $0.name, icon: $0.icon, color: $0.color) }
            .sorted { $0.id < $1.id }
        guard next != chats else { return false }
        chats = next
        return true
    }
}
