import HausModels
import OSLog

/// The loaded Chat pages: what refreshes them, and how the viewer's optimistic
/// rows are retired against them.
extension HausStore {
    func loadMessages(chatID: String) async {
        guard let serverID = activeServer?.id else { return }
        async let cloudAgentLoad: Void = loadCloudAgentWork(serverID: serverID, chatID: chatID)
        do {
            let page: ChatMessagePage = try await client.query(
                "chat.messages",
                input: ChatMessagesInput(serverId: serverID, chatId: chatID, limit: 50)
            )
            let storedPage: ChatMessagePage
            if let existing = messagesByChatID[chatID],
               let existingFirstSequence = existing.messages.first?.sequence,
               let pageFirstSequence = page.messages.first?.sequence,
               existingFirstSequence < pageFirstSequence {
                storedPage = page.merging(older: existing)
            } else {
                storedPage = page
            }
            // A no-op refetch — a read echo, an event for a sibling Chat — must
            // not invalidate the timeline that is already showing this page.
            // The setter drops the equal write.
            messagesByChatID[chatID] = storedPage
            // Same synchronous pass as the page write: no frame can show the
            // optimistic row beside the canonical one, or neither of them.
            reconcilePendingMessages(chatID: chatID, page: storedPage)
        } catch {
            sendError = error.localizedDescription
            Self.logger.error("Loading messages failed: \(error.localizedDescription, privacy: .public)")
        }
        await cloudAgentLoad
    }

    func hasOlderMessages(chatID: String) -> Bool {
        messagesByChatID[chatID]?.nextBeforeSequence != nil
    }

    func hasLoadedMessageHistory(chatID: String) -> Bool {
        messagesByChatID[chatID] != nil
    }

    func isLoadingOlderMessages(chatID: String) -> Bool {
        olderMessageLoadsInFlight.contains(chatID)
    }

    @discardableResult
    func loadOlderMessages(chatID: String) async -> Bool {
        guard let serverID = activeServer?.id,
              let current = messagesByChatID[chatID],
              let beforeSequence = current.nextBeforeSequence,
              olderMessageLoadsInFlight.insert(chatID).inserted
        else { return false }
        defer { olderMessageLoadsInFlight.remove(chatID) }

        do {
            let older: ChatMessagePage = try await client.query(
                "chat.messages",
                input: ChatMessagesInput(
                    serverId: serverID,
                    chatId: chatID,
                    limit: 50,
                    beforeSequence: beforeSequence
                )
            )
            let merged = messagesByChatID[chatID, default: current].merging(older: older)
            messagesByChatID[chatID] = merged
            reconcilePendingMessages(chatID: chatID, page: merged)
            return true
        } catch {
            sendError = error.localizedDescription
            Self.logger.error("Loading older messages failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    func availability(for agent: AgentSummary) -> AgentAvailability {
        lifecycleAvailability[agent.id] ?? agent.availability
    }

    /// Refetches only the loaded message pages touched by the event batch,
    /// while refreshing the Chat list once for ordering, unread counts, and
    /// lifecycle changes. Event IDs make live/catch-up overlap idempotent.
    func applyChatEvents(_ events: [ChatEvent], serverID: String) async {
        guard activeServer?.id == serverID, chatEventServerID == serverID else { return }

        var affectedChatIDs: Set<String> = []
        var shouldReloadChats = false
        var shouldReloadActiveCloudAgentWork = false
        var shouldReloadOpenAsks = false
        var shouldReloadTasks = false
        var inlineRefreshChatIDs: Set<String> = []
        for event in events {
            guard event.serverID == serverID else { continue }
            guard chatEventReplay.receive(event) else { continue }
            inlineRefreshChatIDs.formUnion(inlineReplyRefreshChatIDs(for: event))

            switch event.type {
            case .messageCreated:
                if let chatID = event.chatID {
                    affectedChatIDs.insert(chatID)
                }
                if let parentChatID = event.parentChatID {
                    affectedChatIDs.insert(parentChatID)
                }
                shouldReloadChats = true
            case .cloudAgentWorkUpdated:
                if let chatID = event.chatID {
                    affectedChatIDs.insert(chatID)
                }
                if let parentChatID = event.parentChatID {
                    affectedChatIDs.insert(parentChatID)
                }
                shouldReloadActiveCloudAgentWork = true
            case .chatRead:
                // Server addresses this event to the reader alone, so every one
                // that reaches this client is the echo of its own
                // acknowledgement. It is the single refresh for that read.
                shouldReloadChats = true
            case .threadFollowUpdated:
                if let parentChatID = event.parentChatID {
                    affectedChatIDs.insert(parentChatID)
                }
                shouldReloadChats = true
            case .askUpdated:
                // An Ask created or settled moves two reads: the viewer's open
                // Asks, and the transcript carrying the Ask Message whose
                // marker states the new status. A settlement happens inside a
                // Thread, so the parent Chat refetches beside it.
                if let chatID = event.chatID {
                    affectedChatIDs.insert(chatID)
                }
                if let parentChatID = event.parentChatID {
                    affectedChatIDs.insert(parentChatID)
                }
                shouldReloadOpenAsks = true
            case .taskCreated, .taskUpdated:
                // Creating or changing a Task moves the Server Task lens and
                // the transcript the Task was raised in, but not Chat ordering.
                if let chatID = event.chatID {
                    affectedChatIDs.insert(chatID)
                }
                shouldReloadTasks = true
            case .chatLifecycle:
                shouldReloadChats = true
            case .taskLabelUpdated, .reminderChanged:
                break
            }
        }

        for chatID in affectedChatIDs.sorted() where messagesByChatID[chatID] != nil {
            await loadMessages(chatID: chatID)
            if openChatID == chatID {
                await markChatReadIfNeeded(chatID: chatID)
            }
        }
        if !inlineRefreshChatIDs.isEmpty {
            await refreshInlineReplies(for: inlineRefreshChatIDs)
        }
        if shouldReloadChats {
            try? await reloadChats(serverID: serverID)
        }
        // The Inbox snapshots refresh only when this client already holds them,
        // the way the App's invalidation only refetches a live query: an event
        // must not start a Server-wide read for a surface nobody has opened.
        if shouldReloadOpenAsks, openAsks != nil {
            await loadOpenAsks()
        }
        if shouldReloadTasks, inboxTasks != nil {
            await loadInboxTasks()
        }
        if shouldReloadActiveCloudAgentWork, activeCloudAgentWork != nil {
            await loadActiveCloudAgentWork()
        }
        // An Agent creating an Agent reaches this client as an ordinary
        // `message.created`, and that message's `agent-created` body is the only
        // notice the directory gets: this client does not consume
        // `server.updated`. So a created Agent the directory has never seen is
        // itself the refresh trigger, read from the pages just loaded.
        if namesUnlistedLiveCreatedAgent(in: affectedChatIDs) {
            try? await reloadAgents(serverID: serverID)
        }
    }

    /// Whether a page just loaded names a live Agent the directory does not
    /// hold — the one gap a directory refetch can close.
    ///
    /// A body reading retired is skipped, and that is what keeps this from
    /// standing: the body is projected from the live Agent row on every read,
    /// and the pages scanned here were refetched moments ago in this same
    /// batch, so a retired Agent's body already says so and is never mistaken
    /// for a stale directory. What remains is an Agent whose Computer was
    /// removed, which drops it from `agent.list` without retiring it; that
    /// costs one extra directory read per batch touching its Chat until the
    /// Computer comes back, and asks for nothing this client can cache away.
    private func namesUnlistedLiveCreatedAgent(in chatIDs: Set<String>) -> Bool {
        let listed = Set(agents.map(\.id))
        return chatIDs.contains { chatID in
            messagesByChatID[chatID]?.messages.contains { message in
                guard case let .agentCreated(agent) = message.body else { return false }
                return !(agent.retired || listed.contains(agent.agentID))
            } ?? false
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
        let durableNonces = OptimisticMessageRow.durableNonces(in: page.messages)
        let remaining = pending.filter {
            !OptimisticMessageRow.isSuperseded(nonce: $0.nonce, durableNonces: durableNonces)
        }
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
        guard sourceChatID != canonicalChatID,
              let pending = pendingMessagesByChatID.removeValue(forKey: sourceChatID),
              !pending.isEmpty
        else { return }

        pendingMessagesByChatID[canonicalChatID, default: []].append(contentsOf: pending)
    }
}
