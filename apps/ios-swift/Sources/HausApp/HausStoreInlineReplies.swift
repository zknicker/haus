import HausModels
import HausUI

extension HausStore {
    /// Drops filtered lists when the active Server changes. In-flight requests
    /// keep their marker until they finish; their generation check prevents an
    /// old response from repopulating the new Server's cache.
    func resetInlineReplyCache() {
        historyNavigation = ChatHistoryNavigationState()
        historyLoadsInFlight.removeAll()
        inlineReplyCacheGeneration += 1
        publishTranscripts(transcripts.removeLists { $0.replyRootMessageID != nil })
        inlineReplyChatIDByRootID.removeAll()
    }

    /// Projects a filtered `chat.messages` list without touching the ordinary
    /// Chat list. The Server includes the canonical root in that response; the
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
    func loadInlineReplies(chatID: String, rootMessageID: String, refresh: Bool = false) async -> Bool {
        guard let serverID = activeServer?.id else { return false }
        inlineReplyChatIDByRootID[rootMessageID] = chatID
        historyNavigation.inlineRetention.touch(rootMessageID)
        if !refresh, inlineReplyPagesByRootID[rootMessageID] != nil { return true }
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
        let key = TranscriptKey.inlineReplies(chatID: chatID, rootMessageID: rootMessageID)
        beginListRead(chatID: chatID)
        defer { settleInlineRead(key) }

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
            writeTranscript(page, to: key, as: .refresh(followingLatest: false))
            let evictions = historyNavigation.inlineRetention.evictions(
                cachedIDs: Set(inlineReplyPagesByRootID.keys),
                protectedIDs: inlineReplyLoadsInFlight.union([rootMessageID])
            )
            if !evictions.isEmpty {
                publishTranscripts(transcripts.removeLists { key in
                    key.replyRootMessageID.map(evictions.contains) ?? false
                })
                for id in evictions { inlineReplyChatIDByRootID.removeValue(forKey: id) }
            }
            return true
        } catch is CancellationError {
            return false
        } catch {
            // The Inline replies region draws its own Retry state for this load.
            Self.logger.error("Loading inline replies failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    @discardableResult
    func loadOlderInlineReplies(chatID: String, rootMessageID: String) async -> Bool {
        await loadInlineReplyPage(chatID: chatID, rootMessageID: rootMessageID, older: true)
    }

    func loadInlineReplyPage(chatID: String, rootMessageID: String, older: Bool) async -> Bool {
        guard let serverID = activeServer?.id,
              let current = inlineReplyPagesByRootID[rootMessageID],
              let cursor = older ? current.nextBeforeSequence : current.nextAfterSequence,
              inlineReplyLoadsInFlight.insert(rootMessageID).inserted
        else { return false }
        let generation = inlineReplyCacheGeneration
        let key = TranscriptKey.inlineReplies(chatID: chatID, rootMessageID: rootMessageID)
        beginListRead(chatID: chatID)
        defer { settleInlineRead(key) }

        do {
            let page: ChatMessagePage = try await client.query(
                "chat.messages",
                input: ChatMessagesInput(
                    serverId: serverID,
                    chatId: chatID,
                    limit: 50,
                    beforeSequence: older ? cursor : nil,
                    afterSequence: older ? nil : cursor,
                    replyRootMessageId: rootMessageID
                )
            )
            guard !Task.isCancelled,
                  activeServer?.id == serverID,
                  inlineReplyCacheGeneration == generation
            else { return false }
            writeTranscript(page, to: key, as: older ? .older : .newer)
            return true
        } catch is CancellationError {
            return false
        } catch {
            Self.logger.error("Loading older inline replies failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    /// Releases the chain's list and runs any tail an event asked for while
    /// this read held it.
    private func settleInlineRead(_ key: TranscriptKey) {
        guard case let .inlineReplies(chatID, rootMessageID) = key else { return }
        inlineReplyLoadsInFlight.remove(rootMessageID)
        settleListRead(chatID: chatID)
        Task { await self.drainTail(key) }
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
