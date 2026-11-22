import Foundation
import HausModels

/// What Home's Recent lists: every unread conversation, then the newest DMs.
///
/// Unread Chats and followed Task chats with unread messages always show, so
/// nothing the retired Inbox surfaced goes missing. Read DMs fill the list up
/// to `limit`. A Task chat that already sits in Open tasks stays there.
public enum HomeRecent {
    public enum Item: Equatable, Sendable, Identifiable {
        case chat(ChatSummary, isUnread: Bool)
        case task(ChatUnreadPreview)

        public var id: String {
            switch self {
            case let .chat(chat, _): chat.id
            case let .task(preview): preview.chatID
            }
        }

        public var activityAt: Date {
            switch self {
            case let .chat(chat, _): chat.lastMessage?.createdAt ?? chat.lastActivityAt ?? chat.createdAt
            case let .task(preview): preview.messages.map(\.createdAt).max() ?? .distantPast
            }
        }

        var isUnread: Bool {
            switch self {
            case let .chat(_, isUnread): isUnread
            case .task: true
            }
        }
    }

    public static let defaultLimit = 5

    public static func items(
        chats: [ChatSummary],
        unreadChatIDs: Set<String>,
        unreadTasks: [ChatUnreadPreview],
        openTaskChatIDs: Set<String>,
        limit: Int = defaultLimit
    ) -> [Item] {
        let chatItems: [Item] = chats.compactMap { chat in
            let isUnread = unreadChatIDs.contains(chat.id)
            guard isUnread || (chat.kind == .dm && chat.lastMessage != nil) else { return nil }
            return .chat(chat, isUnread: isUnread)
        }
        let taskItems: [Item] = unreadTasks
            .filter { !openTaskChatIDs.contains($0.chatID) }
            .map(Item.task)
        let ordered = (chatItems + taskItems).sorted { left, right in
            (left.activityAt, left.id) > (right.activityAt, right.id)
        }
        var readSlots = max(0, limit - ordered.count(where: \.isUnread))
        return ordered.filter { item in
            if item.isUnread { return true }
            guard readSlots > 0 else { return false }
            readSlots -= 1
            return true
        }
    }
}

/// How many open Tasks each Project holds, by Project id, from `task.listOpen`.
public enum ProjectTaskCounts {
    public static func open(_ tasks: [TaskRecord]) -> [String: Int] {
        tasks.reduce(into: [:]) { counts, task in
            guard task.state == .open, let projectID = task.projectID else { return }
            counts[projectID, default: 0] += 1
        }
    }
}
