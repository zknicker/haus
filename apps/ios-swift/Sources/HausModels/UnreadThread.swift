import Foundation

/// One `thread.listUnread` row: a Thread holding replies the reader has not
/// read and is attending to — someone else's, past the reader's Thread read
/// marker, in a Thread they follow or mentioning them. A Thread is unread on
/// its own, never through its parent Chat (ADR 0043). Mark read is
/// `chat.markRead` on `threadChatID` through `lastMessageSequence`.
public struct UnreadThread: Codable, Identifiable, Sendable, Equatable {
    public let anchorMessageID: String
    /// The oldest counted reply, where opening the Thread lands.
    public let firstUnreadMessageID: String
    public let firstUnreadSequence: Int
    public let lastActivityAt: Date?
    /// The newest counted reply; nil when its author no longer resolves.
    public let latestReply: ChatLastMessage?
    public let lastMessageSequence: Int
    public let parentChatID: String
    public let serverID: String
    public let threadChatID: String
    public let unreadCount: Int

    public var id: String { threadChatID }

    public init(
        anchorMessageID: String,
        firstUnreadMessageID: String,
        firstUnreadSequence: Int,
        lastActivityAt: Date?,
        latestReply: ChatLastMessage?,
        lastMessageSequence: Int,
        parentChatID: String,
        serverID: String,
        threadChatID: String,
        unreadCount: Int
    ) {
        self.anchorMessageID = anchorMessageID
        self.firstUnreadMessageID = firstUnreadMessageID
        self.firstUnreadSequence = firstUnreadSequence
        self.lastActivityAt = lastActivityAt
        self.latestReply = latestReply
        self.lastMessageSequence = lastMessageSequence
        self.parentChatID = parentChatID
        self.serverID = serverID
        self.threadChatID = threadChatID
        self.unreadCount = unreadCount
    }

    private enum CodingKeys: String, CodingKey {
        case anchorMessageID = "anchorMessageId"
        case firstUnreadMessageID = "firstUnreadMessageId"
        case firstUnreadSequence
        case lastActivityAt
        case latestReply
        case lastMessageSequence
        case parentChatID = "parentChatId"
        case serverID = "serverId"
        case threadChatID = "threadChatId"
        case unreadCount
    }
}

/// `thread.listUnread`'s answer, newest activity first.
public struct UnreadThreadList: Codable, Sendable, Equatable {
    public let threads: [UnreadThread]

    public init(threads: [UnreadThread]) {
        self.threads = threads
    }
}
