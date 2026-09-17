import HausModels
import HausUI

extension HausStore {
    /// Drops filtered pages when the active Server changes. In-flight requests
    /// keep their marker until they finish; their generation check prevents an
    /// old response from repopulating the new Server's cache.
    func resetInlineReplyCache() {
        inlineReplyCacheGeneration += 1
        inlineReplyPagesByRootID.removeAll()
        inlineReplyChatIDByRootID.removeAll()
    }

    /// The event carries the child Chat and, for Thread events, its parent.
    /// These are the only event kinds that can change an inline row's page or
    /// projection; read/follow/lifecycle events do not need a filtered fetch.
    func inlineReplyRefreshChatIDs(for event: ChatEvent) -> Set<String> {
        switch event.type {
        case .messageCreated, .cloudAgentWorkUpdated, .askUpdated, .taskCreated, .taskUpdated:
            return Set([event.chatID, event.parentChatID].compactMap { $0 })
        default:
            return []
        }
    }

    /// Refreshes only roots whose parent Chat was touched by a durable event.
    /// The optional set is omitted by foreground/reconnect refreshes, which
    /// revalidate every filtered page currently held by this Store.
    func refreshInlineReplies(for chatIDs: Set<String>? = nil) async {
        let roots = inlineReplyChatIDByRootID
            .filter { chatIDs == nil || chatIDs?.contains($0.value) == true }
            .sorted { $0.key < $1.key }
        for (rootMessageID, chatID) in roots {
            guard !Task.isCancelled else { return }
            while inlineReplyLoadsInFlight.contains(rootMessageID) {
                do {
                    try await Task.sleep(for: .milliseconds(50))
                } catch {
                    return
                }
            }
            guard inlineReplyChatIDByRootID[rootMessageID] == chatID else { continue }
            let generation = inlineReplyCacheGeneration
            let previous = inlineReplyPagesByRootID.removeValue(forKey: rootMessageID)
            let loaded = await loadInlineReplies(chatID: chatID, rootMessageID: rootMessageID)
            if !loaded,
               generation == inlineReplyCacheGeneration,
               inlineReplyPagesByRootID[rootMessageID] == nil,
               let previous
            {
                inlineReplyPagesByRootID[rootMessageID] = previous
            }
        }
    }

    /// Projects a filtered `chat.messages` page without touching the ordinary
    /// Chat page. The Server includes the canonical root in that response; the
    /// Thread screen already renders that root as its anchor, so only its chain
    /// belongs in the Inline replies region.
    func inlineReplyPresentations(chatID: String, rootMessageID: String) -> [MessagePresentation] {
        trackProjectionDirectory()
        guard let page = inlineReplyPagesByRootID[rootMessageID] else { return [] }
        return durableMessagePresentations(
            page,
            cloudAgentWork: cloudAgentWorkByChatID[chatID] ?? []
        ).filter { $0.id != rootMessageID }
    }

    func hasLoadedInlineReplies(rootMessageID: String) -> Bool {
        inlineReplyPagesByRootID[rootMessageID] != nil
    }

    func hasOlderInlineReplies(rootMessageID: String) -> Bool {
        inlineReplyPagesByRootID[rootMessageID]?.nextBeforeSequence != nil
    }

    func isLoadingInlineReplies(rootMessageID: String) -> Bool {
        inlineReplyLoadsInFlight.contains(rootMessageID)
    }

    @discardableResult
    func loadInlineReplies(chatID: String, rootMessageID: String) async -> Bool {
        guard let serverID = activeServer?.id else { return false }
        inlineReplyChatIDByRootID[rootMessageID] = chatID
        if inlineReplyPagesByRootID[rootMessageID] != nil { return true }
        let generation = inlineReplyCacheGeneration
        guard inlineReplyLoadsInFlight.insert(rootMessageID).inserted else {
            // A route task and its region can start together. Wait for the
            // owner so the region reports the real outcome, not a false error.
            while inlineReplyLoadsInFlight.contains(rootMessageID) {
                do {
                    try await Task.sleep(for: .milliseconds(50))
                } catch {
                    return false
                }
            }
            if generation != inlineReplyCacheGeneration {
                return await loadInlineReplies(chatID: chatID, rootMessageID: rootMessageID)
            }
            return inlineReplyPagesByRootID[rootMessageID] != nil
        }
        defer { inlineReplyLoadsInFlight.remove(rootMessageID) }

        do {
            let page: ChatMessagePage = try await client.query(
                "chat.messages",
                input: ChatMessagesInput(
                    serverId: serverID,
                    chatId: chatID,
                    limit: 50,
                    replyRootMessageId: rootMessageID
                )
            )
            guard !Task.isCancelled,
                  activeServer?.id == serverID,
                  inlineReplyCacheGeneration == generation
            else { return false }
            inlineReplyPagesByRootID[rootMessageID] = page
            return true
        } catch is CancellationError {
            return false
        } catch {
            sendError = error.localizedDescription
            Self.logger.error("Loading inline replies failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    @discardableResult
    func loadOlderInlineReplies(chatID: String, rootMessageID: String) async -> Bool {
        guard let serverID = activeServer?.id,
              let current = inlineReplyPagesByRootID[rootMessageID],
              let beforeSequence = current.nextBeforeSequence,
              inlineReplyLoadsInFlight.insert(rootMessageID).inserted
        else { return false }
        let generation = inlineReplyCacheGeneration
        defer { inlineReplyLoadsInFlight.remove(rootMessageID) }

        do {
            let older: ChatMessagePage = try await client.query(
                "chat.messages",
                input: ChatMessagesInput(
                    serverId: serverID,
                    chatId: chatID,
                    limit: 50,
                    beforeSequence: beforeSequence,
                    replyRootMessageId: rootMessageID
                )
            )
            guard !Task.isCancelled,
                  activeServer?.id == serverID,
                  inlineReplyCacheGeneration == generation
            else { return false }
            inlineReplyPagesByRootID[rootMessageID] = inlineReplyPagesByRootID[rootMessageID, default: current]
                .merging(older: older)
            return true
        } catch is CancellationError {
            return false
        } catch {
            sendError = error.localizedDescription
            Self.logger.error("Loading older inline replies failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    func replyReferencePresentation(
        _ reference: ChatMessageReplyReference
    ) -> MessageReplyReferencePresentation? {
        guard let author = authorPresentation(reference.author) else { return nil }
        return MessageReplyReferencePresentation(
            id: reference.id,
            author: author,
            content: reference.content,
            createdAt: reference.createdAt,
            sequence: reference.sequence
        )
    }
}
