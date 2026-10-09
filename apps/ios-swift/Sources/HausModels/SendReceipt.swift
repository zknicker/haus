import Foundation

public struct SendReceipt: Codable, Sendable, Equatable {
    public let idempotent: Bool
    public let message: ChatMessage
    public let threadChatID: String?

    enum CodingKeys: String, CodingKey {
        case idempotent
        case message
        case threadChatID = "threadChatId"
    }

    public init(idempotent: Bool, message: ChatMessage, threadChatID: String?) {
        self.idempotent = idempotent
        self.message = message
        self.threadChatID = threadChatID
    }
}
