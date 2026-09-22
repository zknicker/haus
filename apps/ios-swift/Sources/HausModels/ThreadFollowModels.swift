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

/// What Server says the follow state became. The cursor names the durable
/// `thread.follow.updated` event this write emitted, which is the fan-out that
/// refreshes the parent Chat page and the Chat list.
public struct ThreadFollowReceipt: Codable, Sendable, Equatable {
    public let eventCursor: String
    public let followed: Bool
    public let serverID: String
    public let threadChatID: String

    public init(eventCursor: String, followed: Bool, serverID: String, threadChatID: String) {
        self.eventCursor = eventCursor
        self.followed = followed
        self.serverID = serverID
        self.threadChatID = threadChatID
    }

    enum CodingKeys: String, CodingKey {
        case eventCursor
        case followed
        case serverID = "serverId"
        case threadChatID = "threadChatId"
    }
}

/// Reading and setting one Thread's follow state inside its parent Chat page.
///
/// A Thread summary lives in the parent page Server sends, so the optimistic
/// toggle and its rollback are both a patch of that page rather than a second
/// copy of the state. Both directions run through these two pure functions so
/// the Store's only job is deciding which value to write.
public enum ThreadFollowPatch {
    /// The Thread's current follow state, or `nil` when the page does not
    /// carry that Thread — a Thread with no Server row yet has nothing to
    /// follow.
    public static func followed(threadChatID: String, in page: ChatMessagePage?) -> Bool? {
        page?.threads.first { $0.threadChatID == threadChatID }?.followed
    }

    /// The page with that Thread's follow state set, or `nil` when there is
    /// nothing to change: no such Thread, or it already states this value.
    public static func page(
        _ page: ChatMessagePage?,
        followed: Bool,
        threadChatID: String
    ) -> ChatMessagePage? {
        guard let page,
              let current = Self.followed(threadChatID: threadChatID, in: page),
              current != followed
        else { return nil }

        return ChatMessagePage(
            messages: page.messages,
            nextBeforeSequence: page.nextBeforeSequence,
            nextAfterSequence: page.nextAfterSequence,
            threads: page.threads.map { thread in
                thread.threadChatID == threadChatID ? thread.following(followed) : thread
            }
        )
    }
}

extension ThreadSummary {
    /// The same summary with a different follow state.
    public func following(_ followed: Bool) -> ThreadSummary {
        ThreadSummary(
            anchorMessageID: anchorMessageID,
            followed: followed,
            latestReplyAt: latestReplyAt,
            recentReplies: recentReplies,
            replyCount: replyCount,
            threadChatID: threadChatID,
            unreadCount: unreadCount
        )
    }
}
