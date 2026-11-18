import Foundation

/// Where a message that references a Task lives, named without a second read:
public struct TaskMessagePlace: Codable, Hashable, Sendable {
    public enum ChatKind: String, Codable, Sendable {
        case channel
        case dm
    }

    public let chatID: String
    public let chatKind: ChatKind
    /// The Channel's name. Nil for a DM, which a context label never names by
    /// its peer.
    public let chatName: String?

    public init(chatID: String, chatKind: ChatKind, chatName: String?) {
        self.chatID = chatID
        self.chatKind = chatKind
        self.chatName = chatName
    }

    public var label: String {
        chatKind == .channel ? "#\(chatName ?? "channel")" : "DM"
    }

    enum CodingKeys: String, CodingKey {
        case chatID = "chatId"
        case chatKind
        case chatName
    }
}
