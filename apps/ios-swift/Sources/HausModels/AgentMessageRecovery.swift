import Foundation

/// The recovery generation a Chat read must carry until its result is applied.
/// A lifecycle recovery advances the generation for every mounted Chat, so a
/// request that started before the committed message cannot write an older page
/// over the recovered one.
public struct ChatMessageReadToken: Equatable, Sendable {
    public let chatID: String
    public let serverID: String
    public let sessionID: Int
    public let generation: Int

    public init(
        chatID: String,
        serverID: String,
        sessionID: Int,
        generation: Int
    ) {
        self.chatID = chatID
        self.serverID = serverID
        self.sessionID = sessionID
        self.generation = generation
    }
}

/// The reads a committed Agent message recovery should fan out to. Search is
/// represented by a revision because its native query is owned by the mounted
/// sheet rather than by the Store.
public struct AgentMessageRecoveryPlan: Equatable, Sendable {
    public let chatIDs: [String]
    public let searchRevision: Int
    public let serverID: String

    public init(chatIDs: [String], searchRevision: Int, serverID: String) {
        self.chatIDs = chatIDs
        self.searchRevision = searchRevision
        self.serverID = serverID
    }
}

/// Owns the ordering contract between Chat reads and a committed Agent-message
/// lifecycle signal. This is deliberately independent of HausApp so the race
/// is testable without Clerk, tRPC, or an Xcode app target.
public struct AgentMessageRecoveryState: Equatable, Sendable {
    private struct Scope: Hashable, Sendable {
        let chatID: String
        let serverID: String
    }

    private var currentGenerationByScope: [Scope: Int] = [:]
    private var sessionID = 0

    public private(set) var searchRevision = 0

    public init() {}

    /// Starts a read carrying the Chat's current recovery generation. Reads in
    /// the same generation may both apply: older-page loads merge with newer
    /// snapshots, so recovery ordering does not change pagination behavior.
    public mutating func beginRead(serverID: String, chatID: String) -> ChatMessageReadToken {
        let scope = Scope(chatID: chatID, serverID: serverID)
        return ChatMessageReadToken(
            chatID: chatID,
            serverID: serverID,
            sessionID: sessionID,
            generation: currentGenerationByScope[scope, default: 0]
        )
    }

    /// Checks both app scope and ordering before a Chat read mutates Store
    /// state. The active Server check belongs here so every caller gets the
    /// same stale-session rule.
    public func accepts(_ token: ChatMessageReadToken, activeServerID: String?) -> Bool {
        guard token.serverID == activeServerID else { return false }
        let scope = Scope(chatID: token.chatID, serverID: token.serverID)
        return token.sessionID == sessionID
            && token.generation == currentGenerationByScope[scope, default: 0]
    }

    /// Advances the mounted Chat generations after the Server commits an Agent
    /// message. Non-sending phases and events for another Server are no-ops.
    /// The lifecycle stream is notification-only, so each confirmed send gets
    /// one recovery pass; durable event replay remains the idempotent path.
    public mutating func beginRecovery(
        event: AgentLifecycleEvent,
        activeServerID: String,
        mountedChatIDs: [String]
    ) -> AgentMessageRecoveryPlan? {
        guard event.phase == .sending, event.serverID == activeServerID else { return nil }

        var uniqueChatIDs: [String] = []
        var seenChatIDs = Set<String>()
        for chatID in mountedChatIDs where seenChatIDs.insert(chatID).inserted {
            uniqueChatIDs.append(chatID)
            let scope = Scope(chatID: chatID, serverID: event.serverID)
            currentGenerationByScope[scope, default: 0] += 1
        }

        searchRevision += 1
        return AgentMessageRecoveryPlan(
            chatIDs: uniqueChatIDs,
            searchRevision: searchRevision,
            serverID: event.serverID
        )
    }

    /// A new SSE session invalidates reads started by the prior session and
    /// allows a later delivery of the same run to recover once in the new
    /// session.
    public mutating func beginSession() {
        sessionID += 1
    }
}
