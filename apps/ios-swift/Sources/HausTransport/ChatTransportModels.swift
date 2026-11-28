import Foundation

/// `chat.send` to a Captain by id, for a Captain whose chat the reader has
/// not loaded: the Server resolves its one shared chat.
public struct SendCaptainChatInput: Encodable, Equatable, Sendable {
    public let agentID: String
    public let attachmentIDs: [String]
    public let content: String
    public let nonce: String
    public let serverID: String
    public let targetKind = "captain"

    public init(
        agentID: String,
        attachmentIDs: [String] = [],
        content: String,
        nonce: String,
        serverID: String
    ) {
        self.agentID = agentID
        self.attachmentIDs = attachmentIDs
        self.content = content
        self.nonce = nonce
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case agentID = "agentId"
        case attachmentIDs = "attachmentIds"
        case content
        case nonce
        case serverID = "serverId"
        case targetKind
    }
}

public struct ChatMentionOptionsInput: Encodable, Equatable, Sendable {
    public let agentIDs: [String]
    public let chatID: String
    public let serverID: String

    public init(agentIDs: [String] = [], chatID: String, serverID: String) {
        self.agentIDs = agentIDs
        self.chatID = chatID
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case agentIDs = "agentIds"
        case chatID = "chatId"
        case serverID = "serverId"
    }
}

public struct CaptainMentionOptionsInput: Encodable, Equatable, Sendable {
    public let agentID: String
    public let agentIDs: [String]
    public let serverID: String
    public let targetKind = "captain"

    public init(agentID: String, agentIDs: [String] = [], serverID: String) {
        self.agentID = agentID
        self.agentIDs = agentIDs
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case agentID = "agentId"
        case agentIDs = "agentIds"
        case serverID = "serverId"
        case targetKind
    }
}
