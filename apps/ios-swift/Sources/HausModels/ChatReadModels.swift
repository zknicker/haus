public struct ChatReadInput: Encodable, Sendable, Equatable {
    public let chatID: String
    /// Inbox Mark read also reads followed Thread replies folded into unreadCount;
    /// opening a Chat must not, so it leaves this nil.
    public let includeThreads: Bool?
    public let sequence: Int
    public let serverID: String

    public init(chatID: String, sequence: Int, serverID: String, includeThreads: Bool? = nil) {
        self.chatID = chatID
        self.includeThreads = includeThreads
        self.sequence = sequence
        self.serverID = serverID
    }

    private enum CodingKeys: String, CodingKey {
        case chatID = "chatId"
        case includeThreads
        case sequence
        case serverID = "serverId"
    }
}

/// `advanced` is false when the marker was already there, in which case no
/// `chat.onRead` event follows.
public struct ChatReadReceipt: Codable, Sendable, Equatable {
    public let advanced: Bool
    public let chatID: String
    public let sequence: Int
    public let serverID: String

    enum CodingKeys: String, CodingKey {
        case advanced
        case chatID = "chatId"
        case sequence
        case serverID = "serverId"
    }
}

/// `chat.unreadChatCount`: the reader's Channels and DMs with anything unread
/// across every Server they belong to — the same number push sets as the
/// app icon badge.
public struct UnreadChatCount: Decodable, Sendable, Equatable {
    public let count: Int

    public init(count: Int) {
        self.count = count
    }
}
