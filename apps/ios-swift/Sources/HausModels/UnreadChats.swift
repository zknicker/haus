import Foundation

/// Which Chats are waiting on the reader: every Chat the Server counts unread,
/// less any Mark read still settling. The Inbox's Unread section, the sidebar's
/// Inbox dot, and the app icon badge all ask this one rule, so they never
/// disagree about what is waiting.
public enum UnreadChats {
    /// Whether the Chat is still unread on this client. A Mark read hides the
    /// Chat at once, and only a message newer than the sequence it covered
    /// brings it back before the Server has answered.
    public static func isUnread(_ chat: ChatSummary, markedReadThrough: [String: Int]) -> Bool {
        guard chat.unreadCount > 0 else { return false }
        guard let marked = markedReadThrough[chat.id] else { return true }
        return chat.lastMessageSequence > marked
    }

    public static func visible(
        _ chats: [ChatSummary],
        markedReadThrough: [String: Int]
    ) -> [ChatSummary] {
        chats.filter { isUnread($0, markedReadThrough: markedReadThrough) }
    }
}
