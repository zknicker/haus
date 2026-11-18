public struct ChatReadInput: Encodable, Sendable, Equatable {
    public let chatID: String
    public let sequence: Int
    public let serverID: String

    public init(chatID: String, sequence: Int, serverID: String) {
        self.chatID = chatID
        self.sequence = sequence
        self.serverID = serverID
    }

    private enum CodingKeys: String, CodingKey {
        case chatID = "chatId"
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

public struct UnreadChatCount: Decodable, Sendable, Equatable {
    public let count: Int

    public init(count: Int) {
        self.count = count
    }
}
