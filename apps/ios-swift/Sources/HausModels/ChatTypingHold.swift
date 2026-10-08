import Foundation

/// One Agent kept in the header's engagement row after its engagement ended, until its
/// reply shows (the App's `chat-typing-hold.ts`).
///
/// A `--done` reply ends engagement live, but its message reaches the
/// transcript after the Chat lane's batch and refetch, up to a second later.
/// The row keeps that Agent until the reply is there, and gives up after
/// `replyHold`.
public struct ChatTypingHold: Sendable, Equatable {
    public static let replyHold: TimeInterval = 2
    /// The reply commits just before its end is announced; older posts of the
    /// run are interim messages, not the answer.
    static let replyCommitWindow: TimeInterval = 2

    public let end: ChatEngagementEvent
    public let expiresAt: Date

    public init(end: ChatEngagementEvent, expiresAt: Date) {
        self.end = end
        self.expiresAt = expiresAt
    }

    /// The engagement the row keeps showing while this hold waits.
    public var engagement: ChatEngagement {
        ChatEngagement(agentID: end.agentID, chatID: end.chatID, runID: end.runID, startedAt: end.emittedAt)
    }

    /// Whether an ended engagement holds its Agent: only a `sent` end whose
    /// reply the transcript does not show yet. A settled or interrupted run
    /// leaves at once.
    public static func hold(
        for end: ChatEngagementEvent,
        messages: [ChatMessage],
        now: Date
    ) -> ChatTypingHold? {
        guard end.kind == .ended(.sent), !isReplyVisible(end, in: messages) else { return nil }
        return ChatTypingHold(end: end, expiresAt: now.addingTimeInterval(replyHold))
    }

    /// Whether this hold is done: its reply arrived or its time ran out.
    public func isReleased(messages: [ChatMessage], now: Date) -> Bool {
        now >= expiresAt || Self.isReplyVisible(end, in: messages)
    }

    /// Whether the run's own reply, committed around its end, is in the transcript.
    public static func isReplyVisible(_ end: ChatEngagementEvent, in messages: [ChatMessage]) -> Bool {
        let earliest = end.emittedAt.addingTimeInterval(-replyCommitWindow)
        return messages.contains { message in
            guard message.runID == end.runID,
                  case .agent(let agentID, _) = message.author,
                  agentID == end.agentID
            else { return false }
            return message.createdAt >= earliest
        }
    }
}

extension [ChatEngagement] {
    /// The live engagements plus held Agents, each run once, live ones first.
    public func withHeld(_ holds: [ChatTypingHold]) -> [ChatEngagement] {
        let held = holds
            .filter { !engages(agentID: $0.end.agentID, runID: $0.end.runID) }
            .map(\.engagement)
        return held.isEmpty ? self : self + held
    }
}
