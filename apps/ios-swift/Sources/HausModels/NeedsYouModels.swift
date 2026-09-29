import Foundation

/// The newest message addressing the viewer in a Needs you row's Chat.
public struct NeedsYouLatest: Decodable, Sendable, Equatable {
    public let author: ChatAuthor
    public let createdAt: Date
    public let messageID: String
    /// Plain-text excerpt of the message content, cut to the Server's preview
    /// budget.
    public let preview: String
    /// Chat sequence in the row's `chatID`; Done passes it as
    /// `throughSequence`.
    public let sequence: Int

    enum CodingKeys: String, CodingKey {
        case author
        case createdAt
        case messageID = "messageId"
        case preview
        case sequence
    }
}

/// Why a row is addressed to the viewer, carrying the one Chat fact each
/// reason names. A DM row is always `dm` and a Channel row always `mention`
/// or `reply`, so the reason and the Chat kind cannot disagree here either.
public enum NeedsYouReason: Sendable, Equatable {
    /// A message from someone else in a DM the viewer belongs to. The peer is
    /// the DM's Agent in an Agent DM, else its other human, as `Chat` names it.
    case dm(peerUserID: String?, peerAgentID: String?)
    /// A Channel or Thread message whose content mentions the viewer.
    case mention(chatName: String)
    /// A Channel message that inline-replies to a message the viewer wrote.
    case reply(chatName: String)
}

/// One Chat addressed to the viewer that they have not answered or marked
/// Done (ADR 0037), as `inbox.needsYou` returns it
/// (`packages/haus-api/src/needs-you.ts`).
///
/// It clears when the viewer replies where the addresser will see it, or
/// marks it Done; newer addressing activity after Done brings it back.
public struct NeedsYouRow: Decodable, Identifiable, Sendable, Equatable {
    /// Addressing messages since the viewer last answered here or marked Done.
    public let addressedCount: Int
    /// The Chat holding the addressing messages: a Thread's own Chat for a
    /// Thread row, else the Channel or DM. The row identity and Done target.
    public let chatID: String
    /// The Channel or DM the conversation belongs to, never a Thread.
    public let conversationChatID: String
    public let latest: NeedsYouLatest
    public let reason: NeedsYouReason
    /// The Thread's anchor in `conversationChatID`; nil for a top-level row.
    public let threadAnchorMessageID: String?

    public var id: String { chatID }

    enum CodingKeys: String, CodingKey {
        case addressedCount
        case chatID = "chatId"
        case chatKind
        case chatName
        case chatPeerAgentID = "chatPeerAgentId"
        case chatPeerUserID = "chatPeerUserId"
        case conversationChatID = "conversationChatId"
        case latest
        case reason
        case threadAnchorMessageID = "threadAnchorMessageId"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        addressedCount = try container.decode(Int.self, forKey: .addressedCount)
        chatID = try container.decode(String.self, forKey: .chatID)
        conversationChatID = try container.decode(String.self, forKey: .conversationChatID)
        latest = try container.decode(NeedsYouLatest.self, forKey: .latest)
        threadAnchorMessageID = try container.decodeIfPresent(String.self, forKey: .threadAnchorMessageID)
        let kind = try container.decode(ChatKind.self, forKey: .chatKind)
        switch (try container.decode(String.self, forKey: .reason), kind) {
        case ("dm", .dm):
            reason = .dm(
                peerUserID: try container.decodeIfPresent(String.self, forKey: .chatPeerUserID),
                peerAgentID: try container.decodeIfPresent(String.self, forKey: .chatPeerAgentID)
            )
        case ("mention", .channel):
            reason = .mention(chatName: try container.decode(String.self, forKey: .chatName))
        case ("reply", .channel):
            reason = .reply(chatName: try container.decode(String.self, forKey: .chatName))
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .reason,
                in: container,
                debugDescription: "A Needs you reason must match its Chat kind."
            )
        }
        // The contract's own refine: a Thread row names its anchor, and a
        // top-level row is its own conversation.
        guard (threadAnchorMessageID == nil) == (chatID == conversationChatID) else {
            throw DecodingError.dataCorruptedError(
                forKey: .threadAnchorMessageID,
                in: container,
                debugDescription: "A Thread row names its anchor; a top-level row is its own conversation."
            )
        }
    }

    public var isThread: Bool { threadAnchorMessageID != nil }
}

/// Input for `inbox.markDone`: Done through `throughSequence` in `chatId`.
public struct InboxMarkDoneInput: Encodable, Equatable, Sendable {
    public let chatID: String
    public let serverID: String
    public let throughSequence: Int

    public init(serverID: String, row: NeedsYouRow) {
        chatID = row.chatID
        self.serverID = serverID
        throughSequence = row.latest.sequence
    }

    enum CodingKeys: String, CodingKey {
        case chatID = "chatId"
        case serverID = "serverId"
        case throughSequence
    }
}

/// `inbox.markDone`'s receipt.
public struct InboxMarkDoneResult: Decodable, Equatable, Sendable {
    public let chatID: String
    public let doneSequence: Int

    enum CodingKeys: String, CodingKey {
        case chatID = "chatId"
        case doneSequence
    }
}

/// What the Inbox's Needs you section and its neighbours ask of the rows.
public enum NeedsYou {
    /// The rows still shown while a Done is in flight: a Done removes its row
    /// at once, and only a newer addressing message than the one it covered
    /// brings the row back before the Server has answered.
    public static func visible(
        _ rows: [NeedsYouRow],
        doneThrough: [String: Int]
    ) -> [NeedsYouRow] {
        rows.filter { row in
            guard let done = doneThrough[row.chatID] else { return true }
            return row.latest.sequence > done
        }
    }

    /// Chats that already have a row, which Conversations leaves out so one
    /// conversation is never listed twice.
    public static func chatIDs(_ rows: [NeedsYouRow]) -> Set<String> {
        Set(rows.map(\.chatID))
    }
}
