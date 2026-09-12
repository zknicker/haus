import Foundation

public struct ChatMessagePage: Codable, Sendable, Equatable {
    public let messages: [ChatMessage]
    public let nextBeforeSequence: Int?
    public let threads: [ThreadSummary]

    public init(messages: [ChatMessage], nextBeforeSequence: Int?, threads: [ThreadSummary]) {
        self.messages = messages
        self.nextBeforeSequence = nextBeforeSequence
        self.threads = threads
    }

    /// Combines an older page with the currently visible page while keeping the
    /// timeline in server sequence order. The current page wins on duplicate ids
    /// so a foreground refresh remains authoritative for overlapping rows.
    public func merging(older olderPage: ChatMessagePage) -> ChatMessagePage {
        var messagesByID: [String: ChatMessage] = [:]
        for message in olderPage.messages {
            messagesByID[message.id] = message
        }
        for message in messages {
            messagesByID[message.id] = message
        }

        var threadsByAnchorID: [String: ThreadSummary] = [:]
        for thread in olderPage.threads {
            threadsByAnchorID[thread.anchorMessageID] = thread
        }
        for thread in threads {
            threadsByAnchorID[thread.anchorMessageID] = thread
        }

        return ChatMessagePage(
            messages: messagesByID.values.sorted {
                ($0.sequence, $0.id) < ($1.sequence, $1.id)
            },
            nextBeforeSequence: olderPage.nextBeforeSequence,
            threads: threadsByAnchorID.values.sorted {
                $0.anchorMessageID < $1.anchorMessageID
            }
        )
    }
}
