import HausModels
import OSLog

/// The loaded Chat pages: what refreshes them, and how the viewer's optimistic
/// rows are retired against them.
extension HausStore {
    func availability(for agent: AgentSummary) -> AgentAvailability {
        lifecycleAvailability[agent.id] ?? agent.availability
    }

    /// Whether a page just read names a live Agent the directory does not
    /// hold — the one gap a directory refetch can close. An Agent creating an
    /// Agent reaches this client as an ordinary message, whose `agent-created`
    /// body is the only notice the directory gets.
    ///
    /// A body reading retired is skipped, and that is what keeps this from
    /// standing: the body is projected from the live Agent row on every read,
    /// so a retired Agent's body already says so and is never mistaken for a
    /// stale directory. What remains is an Agent whose Computer was removed,
    /// which drops it from `agent.list` without retiring it; that costs one
    /// extra directory read per tail read touching it until the Computer comes
    /// back.
    func namesUnlistedLiveCreatedAgent(in page: ChatMessagePage) -> Bool {
        let listed = Set(agents.map(\.id))
        return page.messages.contains { message in
            guard case let .agentCreated(agent) = message.body else { return false }
            return !(agent.retired || listed.contains(agent.agentID))
        }
    }

    // MARK: - Optimistic rows

    /// Binds the optimistic row to the canonical message the send receipt
    /// named, before the page carrying it is refetched. The durable row that
    /// replaces it then arrives under the same id, so the transcript updates
    /// that row in place instead of dropping it and inserting a new one.
    func adoptSentMessageID(_ messageID: String, nonce: String, in chatID: String) {
        guard var pending = pendingMessagesByChatID[chatID],
              let index = pending.firstIndex(where: { $0.nonce == nonce })
        else { return }

        pending[index].serverMessageID = messageID
        pendingMessagesByChatID[chatID] = pending
    }

    /// Retires the optimistic rows this page now accounts for. The projection
    /// applies the same rule while rendering, so the two can never disagree
    /// about which row is on screen.
    func reconcilePendingMessages(chatID: String, page: ChatMessagePage) {
        guard let pending = pendingMessagesByChatID[chatID] else { return }
        let remaining = OptimisticMessageRow.unsettled(pending, page: page.messages)
        if remaining.isEmpty {
            pendingMessagesByChatID.removeValue(forKey: chatID)
        } else {
            pendingMessagesByChatID[chatID] = remaining
        }
    }

    func removePendingMessage(chatID: String, nonce: String) {
        pendingMessagesByChatID[chatID]?.removeAll { $0.nonce == nonce }
        if pendingMessagesByChatID[chatID]?.isEmpty == true {
            pendingMessagesByChatID.removeValue(forKey: chatID)
        }
    }

    func removePendingMessage(nonce: String) {
        for chatID in Array(pendingMessagesByChatID.keys) {
            removePendingMessage(chatID: chatID, nonce: nonce)
        }
    }

    func adoptPendingMessages(from sourceChatID: String, to canonicalChatID: String) {
        guard sourceChatID != canonicalChatID else { return }
        if adoptedChatIDs[sourceChatID] != canonicalChatID {
            adoptedChatIDs[sourceChatID] = canonicalChatID
        }
        guard let pending = pendingMessagesByChatID.removeValue(forKey: sourceChatID),
              !pending.isEmpty
        else { return }

        pendingMessagesByChatID[canonicalChatID, default: []].append(contentsOf: pending)
    }
}
