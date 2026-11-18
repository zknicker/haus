import Foundation

public struct SendReceipt: Codable, Sendable, Equatable {
    public let idempotent: Bool
    public let message: ChatMessage

    public init(idempotent: Bool, message: ChatMessage) {
        self.idempotent = idempotent
        self.message = message
    }
}
