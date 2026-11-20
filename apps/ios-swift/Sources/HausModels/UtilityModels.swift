import Foundation

/// The focused input used by the native utility surfaces to search durable Chat
/// messages. The field names intentionally mirror `chat.search` exactly.
public struct ChatSearchInput: Encodable, Equatable, Sendable {
    public let after: Date?
    public let authorAgentID: String?
    public let authorUserID: String?
    public let chatID: String?
    public let limit: Int
    public let query: String
    public let serverID: String

    public init(
        query: String,
        serverID: String,
        limit: Int = 50,
        after: Date? = nil,
        authorAgentID: String? = nil,
        authorUserID: String? = nil,
        chatID: String? = nil
    ) {
        self.after = after
        self.authorAgentID = authorAgentID
        self.authorUserID = authorUserID
        self.chatID = chatID
        self.limit = limit
        self.query = query
        self.serverID = serverID
    }

    private enum CodingKeys: String, CodingKey {
        case after
        case authorAgentID = "authorAgentId"
        case authorUserID = "authorUserId"
        case chatID = "chatId"
        case limit
        case query
        case serverID = "serverId"
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        // TRPCClient's encoder is intentionally dependency-free and may not
        // have Haus's Date strategy installed. Encode this timestamp at the
        // contract boundary so `chat.search` never receives Foundation's
        // numeric date representation.
        try container.encodeIfPresent(after.map(HausISO8601.string), forKey: .after)
        try container.encodeIfPresent(authorAgentID, forKey: .authorAgentID)
        try container.encodeIfPresent(authorUserID, forKey: .authorUserID)
        try container.encodeIfPresent(chatID, forKey: .chatID)
        try container.encode(limit, forKey: .limit)
        try container.encode(query, forKey: .query)
        try container.encode(serverID, forKey: .serverID)
    }
}

/// A `chat.search` row keeps the existing message projection intact and adds
/// only the archive marker needed by the Archived surface.
public struct ChatSearchResult: Decodable, Identifiable, Equatable, Sendable {
    public let message: ChatMessage
    public let chatArchivedAt: Date?

    public var id: String { message.id }

    public init(message: ChatMessage, chatArchivedAt: Date?) {
        self.message = message
        self.chatArchivedAt = chatArchivedAt
    }

    private enum CodingKeys: String, CodingKey {
        case chatArchivedAt
    }

    public init(from decoder: Decoder) throws {
        message = try ChatMessage(from: decoder)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        chatArchivedAt = try container.decodeIfPresent(Date.self, forKey: .chatArchivedAt)
    }
}

/// Shared input for focused Chat reads and channel lifecycle mutations.
public struct ChatScopeInput: Encodable, Equatable, Sendable {
    public let chatID: String
    public let serverID: String

    public init(chatID: String, serverID: String) {
        self.chatID = chatID
        self.serverID = serverID
    }

    private enum CodingKeys: String, CodingKey {
        case chatID = "chatId"
        case serverID = "serverId"
    }
}

/// The exact input accepted by `chat.listArchived`.
public typealias ArchivedChatsInput = ServerScopeInput

/// Server-scoped input used by `chat.list` and `chat.listArchived`.
public struct ServerScopeInput: Encodable, Equatable, Sendable {
    public let serverID: String

    public init(serverID: String) {
        self.serverID = serverID
    }

    private enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
    }
}

/// The input `project.create` accepts from this form: a new Project starts with no Agents.
public struct CreateChannelInput: Encodable, Equatable, Sendable {
    public let name: String
    public let serverID: String

    public init(name: String, serverID: String) {
        self.name = name
        self.serverID = serverID
    }

    private enum CodingKeys: String, CodingKey {
        case name
        case serverID = "serverId"
    }
}

/// The part of `project.create`'s result this app reads: the new channel.
public struct CreatedProjectResult: Decodable, Sendable {
    public let chat: ChatSummary
}

/// The receipt returned by `chat.unarchiveChannel`.
public struct ChatChannelLifecycleReceipt: Codable, Equatable, Sendable {
    public let archivedAt: Date?
    public let chatID: String
    public let serverID: String

    public init(archivedAt: Date?, chatID: String, serverID: String) {
        self.archivedAt = archivedAt
        self.chatID = chatID
        self.serverID = serverID
    }

    private enum CodingKeys: String, CodingKey {
        case archivedAt
        case chatID = "chatId"
        case serverID = "serverId"
    }
}
