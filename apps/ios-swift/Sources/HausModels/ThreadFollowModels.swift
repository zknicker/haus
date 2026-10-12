import Foundation

/// The `thread.setFollow` contract, in Server's own wire names.
public struct ThreadFollowInput: Encodable, Sendable, Equatable {
    public let follow: Bool
    public let serverID: String
    public let threadChatID: String

    public init(follow: Bool, serverID: String, threadChatID: String) {
        self.follow = follow
        self.serverID = serverID
        self.threadChatID = threadChatID
    }

    private enum CodingKeys: String, CodingKey {
        case follow
        case serverID = "serverId"
        case threadChatID = "threadChatId"
    }
}

/// What Server says the follow state became. The `thread.onFollowUpdated`
/// notification that follows refreshes the anchor entity and the Chat list.
public struct ThreadFollowReceipt: Codable, Sendable, Equatable {
    public let followed: Bool
    public let serverID: String
    public let threadChatID: String

    public init(followed: Bool, serverID: String, threadChatID: String) {
        self.followed = followed
        self.serverID = serverID
        self.threadChatID = threadChatID
    }

    enum CodingKeys: String, CodingKey {
        case followed
        case serverID = "serverId"
        case threadChatID = "threadChatId"
    }
}

/// The `thread.get` input: one Thread named by its own Chat id.
public struct ThreadContextInput: Encodable, Sendable, Equatable {
    public let serverID: String
    public let threadChatID: String

    public init(serverID: String, threadChatID: String) {
        self.serverID = serverID
        self.threadChatID = threadChatID
    }

    private enum CodingKeys: String, CodingKey {
        case serverID = "serverId"
        case threadChatID = "threadChatId"
    }
}

/// Where a Thread hangs: its parent Chat and the anchor Message in it.
public struct ThreadContext: Decodable, Sendable, Equatable {
    public let anchorMessageID: String
    public let parentChatID: String
    public let serverID: String
    public let threadChatID: String

    public init(anchorMessageID: String, parentChatID: String, serverID: String, threadChatID: String) {
        self.anchorMessageID = anchorMessageID
        self.parentChatID = parentChatID
        self.serverID = serverID
        self.threadChatID = threadChatID
    }

    private enum CodingKeys: String, CodingKey {
        case anchorMessageID = "anchorMessageId"
        case parentChatID = "parentChatId"
        case serverID = "serverId"
        case threadChatID = "threadChatId"
    }
}

/// Reading one Thread's follow state from its parent Chat page.
///
/// A Thread summary lives on its anchor message's entity, which the parent
/// page carries. The press itself is an app-local overlay in the Store; it
/// never writes the entity.
public enum ThreadFollowState {
    /// The Thread's current follow state, or `nil` when the page does not
    /// carry that Thread — a Thread with no Server row yet has nothing to
    /// follow.
    public static func followed(threadChatID: String, in page: ChatMessagePage?) -> Bool? {
        page?.threads.first { $0.threadChatID == threadChatID }?.followed
    }
}
