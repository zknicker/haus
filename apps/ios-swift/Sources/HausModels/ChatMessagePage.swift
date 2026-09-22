import Foundation

public struct ChatMessagePage: Codable, Sendable, Equatable {
    public let messages: [ChatMessage]
    public let nextBeforeSequence: Int?
    public let nextAfterSequence: Int?
    public let threads: [ThreadSummary]

    public init(
        messages: [ChatMessage],
        nextBeforeSequence: Int?,
        nextAfterSequence: Int? = nil,
        threads: [ThreadSummary]
    ) {
        self.messages = messages
        self.nextBeforeSequence = nextBeforeSequence
        self.nextAfterSequence = nextAfterSequence
        self.threads = threads
    }
}
