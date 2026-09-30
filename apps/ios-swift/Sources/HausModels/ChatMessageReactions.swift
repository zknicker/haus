import Foundation

/// Who reacted: a human member or an Agent. Mirrors
/// `chatMessageReactionActorSchema` in `packages/haus-api`.
public struct ChatMessageReactionActor: Codable, Hashable, Sendable {
    public enum Kind: String, Codable, Sendable {
        case agent
        case human
    }

    public let handle: String?
    public let id: String
    public let kind: Kind

    public init(handle: String? = nil, id: String, kind: Kind) {
        self.handle = handle
        self.id = id
        self.kind = kind
    }
}

/// One emoji on a Message with everyone who reacted with it, in arrival order.
/// The Server lists emoji in the order each first arrived.
public struct ChatMessageReaction: Codable, Hashable, Sendable {
    public let actors: [ChatMessageReactionActor]
    public let emoji: String

    public init(actors: [ChatMessageReactionActor], emoji: String) {
        self.actors = actors
        self.emoji = emoji
    }
}

/// `chat.react` input: the viewer adds, or with `remove`, takes back one emoji.
public struct ChatMessageReactionInput: Encodable, Sendable, Equatable {
    public let emoji: String
    public let messageID: String
    public let remove: Bool
    public let serverID: String

    enum CodingKeys: String, CodingKey {
        case emoji
        case messageID = "messageId"
        case remove
        case serverID = "serverId"
    }

    public init(emoji: String, messageID: String, remove: Bool, serverID: String) {
        self.emoji = emoji
        self.messageID = messageID
        self.remove = remove
        self.serverID = serverID
    }
}

/// `chat.react` answer. The Message carries its reactions after the change.
public struct ChatMessageReactionReceipt: Decodable, Sendable, Equatable {
    public let changed: Bool
    public let message: ChatMessage
}

extension ChatMessagePage {
    /// The page with one message's reactions replaced by what the Server just
    /// answered, or `nil` when the page does not carry that message or it
    /// already says so. The `chat.react` receipt lands through this, ahead of
    /// the durable event's refetch.
    public func replacingReactions(
        _ reactions: [ChatMessageReaction],
        messageID: String
    ) -> ChatMessagePage? {
        guard let index = messages.firstIndex(where: { $0.id == messageID }),
              messages[index].reactions != reactions
        else { return nil }
        var patched = messages
        patched[index].reactions = reactions
        return ChatMessagePage(
            messages: patched,
            nextBeforeSequence: nextBeforeSequence,
            nextAfterSequence: nextAfterSequence,
            threads: threads
        )
    }
}
