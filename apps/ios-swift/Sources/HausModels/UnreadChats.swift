import Foundation

/// Which Chats are waiting on the reader: every Chat the Server counts unread,
/// less any Mark read still settling. The Inbox's Unread section and the
/// sidebar's Inbox dot ask this one rule, with `UnreadThreads`, so they never
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

/// Which Threads are waiting on the reader, as their own Inbox rows
/// (ADR 0043): every `thread.listUnread` row whose parent the Chat list holds,
/// less any Mark read still settling. A Thread whose parent is not listed yet
/// waits for it, so a row always has its parent to name and the dot never
/// counts a row the section hides.
public enum UnreadThreads {
    public static func isUnread(_ thread: UnreadThread, markedReadThrough: [String: Int]) -> Bool {
        guard let marked = markedReadThrough[thread.threadChatID] else { return true }
        return thread.lastMessageSequence > marked
    }

    public static func visible(
        _ threads: [UnreadThread],
        parentChatIDs: Set<String>,
        markedReadThrough: [String: Int]
    ) -> [UnreadThread] {
        threads.filter {
            parentChatIDs.contains($0.parentChatID)
                && isUnread($0, markedReadThrough: markedReadThrough)
        }
    }
}
