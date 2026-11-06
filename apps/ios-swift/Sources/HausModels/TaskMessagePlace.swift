import Foundation

/// Where a message that references a Task lives, named without a second read:
/// the Channel or DM it sits in or under, and the Thread when it is a Thread
/// reply, whose own Chat the Chat list never holds.
public struct TaskMessagePlace: Codable, Hashable, Sendable {
    public enum ChatKind: String, Codable, Sendable {
        case channel
        case dm
    }

    /// The Channel or DM: the message's own Chat, or the one its Thread hangs off.
    public let chatID: String
    public let chatKind: ChatKind
    /// The Channel's name. Nil for a DM, which a context label never names by
    /// its peer.
    public let chatName: String?
    /// The message the Thread hangs off when this is a Thread reply.
    public let threadAnchorMessageID: String?

    public init(chatID: String, chatKind: ChatKind, chatName: String?, threadAnchorMessageID: String?) {
        self.chatID = chatID
        self.chatKind = chatKind
        self.chatName = chatName
        self.threadAnchorMessageID = threadAnchorMessageID
    }

    /// `#security`, `#security · Thread`, `DM`, or `DM · Thread`.
    public var label: String {
        let name = chatKind == .channel ? "#\(chatName ?? "channel")" : "DM"
        return threadAnchorMessageID == nil ? name : "\(name) · Thread"
    }

    enum CodingKeys: String, CodingKey {
        case chatID = "chatId"
        case chatKind
        case chatName
        case threadAnchorMessageID = "threadAnchorMessageId"
    }
}
