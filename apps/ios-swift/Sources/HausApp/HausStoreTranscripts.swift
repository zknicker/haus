import Foundation
import HausModels
import HausUI
import OSLog

/// One in-flight `chat.message` read, so a newer refresh can cancel it and
/// only the read it started clears the slot.
struct EntityLoad {
    let token: UUID
    let task: Task<Void, Never>
}

/// The targeted reads that keep the normalized transcript cache converging
/// (specs/realtime-events.md, iPhone impact): tail reads for new messages,
/// per-message refreshes for changed annotations, and bulk reloads of loaded
/// pages for recovery. Every read is the Server's truth, so a duplicate, late,
/// or reordered event costs at most one empty read.
extension HausStore {
    /// Rebuilds the rendered pages of the lists a transcript write touched.
    func publishTranscripts(_ changed: Set<TranscriptKey>) {
        guard !changed.isEmpty else { return }
        var pages = messagesByChatID
        var inlinePages = inlineReplyPagesByRootID
        for key in changed {
            switch key {
            case let .chat(chatID): pages[chatID] = transcripts.page(key)
            case let .inlineReplies(_, rootMessageID): inlinePages[rootMessageID] = transcripts.page(key)
            }
        }
        setMessagePages(pages, inlinePages: inlinePages)
    }

    /// Lands a canonical page read on its list. A deleted Chat's late read
    /// writes nothing.
    func writeTranscript(_ page: ChatMessagePage, to key: TranscriptKey, as write: TranscriptWrite) {
        guard !deletedChatIDs.contains(key.chatID) else { return }
        publishTranscripts(transcripts.write(page, to: key, as: write))
    }

    // MARK: - List reads and the dirty set

    func beginListRead(chatID: String) {
        transcriptReads.beginListRead(chatID: chatID)
    }

    /// A list read that may have seeded an older copy of a changed message
    /// settles: read those messages again.
    func settleListRead(chatID: String) {
        for messageID in transcriptReads.finishListRead(chatID: chatID) {
            readEntity(EntityRefresh(chatID: chatID, messageID: messageID))
        }
    }

    // MARK: - Tail reads

    /// `chat.onMessageCreated`: every loaded list of the Chat reads its tail,
    /// including one whose first load is still in flight.
    func requestTail(chatID: String, through sequence: Int) {
        var keys = Set(transcripts.keys(chatID: chatID))
        if historyLoadsInFlight.contains(chatID) { keys.insert(.chat(chatID)) }
        for key in keys {
            transcriptReads.noteTail(key, through: sequence)
            if !isListReadBusy(key) {
                Task { await self.drainTail(key) }
            }
        }
    }

    /// Every start of the message stream: any message committed before it
    /// subscribed has no event, so each loaded list reads its tail.
    func tailLoadedTranscripts() {
        for chatID in Set(transcripts.lists.keys.map(\.chatID)) {
            requestTail(chatID: chatID, through: .max)
        }
    }

    /// Runs the list's pending tail read once the read holding the list has
    /// settled. Every list read owner calls this as it finishes.
    func drainTail(_ key: TranscriptKey) async {
        guard !isListReadBusy(key), tailReadsInFlight.insert(key).inserted else { return }
        defer { tailReadsInFlight.remove(key) }
        while let through = transcriptReads.takeTail(key), !Task.isCancelled {
            await readTail(key, through: through)
        }
    }

    private func isListReadBusy(_ key: TranscriptKey) -> Bool {
        if tailReadsInFlight.contains(key) { return true }
        switch key {
        case let .chat(chatID): return historyLoadsInFlight.contains(chatID)
        case let .inlineReplies(_, rootMessageID): return inlineReplyLoadsInFlight.contains(rootMessageID)
        }
    }

    /// Reads after the list's last scan until caught up. A filtered list
    /// resumes after what its scans examined, so it gains only its own
    /// messages and never rescans; a missed event's gap is filled by the same
    /// read.
    private func readTail(_ key: TranscriptKey, through sequence: Int) async {
        guard let serverID = activeServer?.id,
              case var .read(after) = TranscriptReads.tailPlan(for: transcripts.lists[key], through: sequence)
        else { return }
        while !Task.isCancelled {
            beginListRead(chatID: key.chatID)
            defer { settleListRead(chatID: key.chatID) }
            let epoch = transcriptReads.tailEpoch
            let page: ChatMessagePage
            do {
                page = try await client.query("chat.messages", input: ChatMessagesInput(
                    serverId: serverID, chatId: key.chatID, limit: ChatHistoryWindow.defaultPageSize,
                    afterSequence: after, replyRootMessageId: key.replyRootMessageID
                ))
            } catch {
                if !(error is CancellationError) {
                    Self.logger.warning("Tail read failed: \(error.localizedDescription, privacy: .public)")
                }
                return
            }
            // A navigation that replaced the list meanwhile owns it now.
            guard !Task.isCancelled, activeServer?.id == serverID,
                  transcripts.lists[key]?.scannedThroughSequence == after,
                  // A label update since this read began: drop it, read again.
                  transcriptReads.acceptsTail(key, through: sequence, epoch: epoch)
            else { return }
            writeTranscript(page, to: key, as: .tail)
            if case let .chat(chatID) = key {
                reconcilePendingMessages(chatID: chatID, page: page)
            }
            if namesUnlistedLiveCreatedAgent(in: page) {
                try? await reloadAgents(serverID: serverID)
            }
            guard page.nextAfterSequence != nil,
                  let next = transcripts.lists[key]?.scannedThroughSequence, next > after
            else { break }
            after = next
        }
        if case let .chat(chatID) = key, openChatID == chatID {
            await markChatReadIfNeeded(chatID: chatID)
        }
    }

    // MARK: - Per-message refresh

    /// A changed annotation (reaction, Thread summary, task, Cloud Agent work):
    /// mark it dirty for list reads in flight, cancel any older read of it,
    /// and read it again if a view shows it.
    func refreshEntity(_ refresh: EntityRefresh) {
        transcriptReads.markDirty(refresh)
        readEntity(refresh)
    }

    func readEntity(_ refresh: EntityRefresh) {
        let messageID = refresh.messageID
        entityLoads.removeValue(forKey: messageID)?.task.cancel()
        // Nothing lists it: the next list read seeds the current copy.
        guard transcripts.isListed(messageID), let serverID = activeServer?.id else { return }
        guard isShown(messageID) else {
            staleEntities.insert(refresh)
            return
        }
        staleEntities.remove(refresh)
        let token = UUID()
        let task = Task { [weak self] in
            guard let self else { return }
            do {
                let entity: ChatMessageEntity? = try await client.query(
                    "chat.message",
                    input: ChatMessageInput(serverID: serverID, chatID: refresh.chatID, messageID: messageID)
                )
                guard !Task.isCancelled, activeServer?.id == serverID,
                      !deletedChatIDs.contains(refresh.chatID)
                else { return }
                // Null: the id no longer resolves; the next list read drops it.
                if let entity { publishTranscripts(transcripts.setEntity(entity)) }
            } catch {
                if !(error is CancellationError) {
                    Self.logger.warning("Message refresh failed: \(error.localizedDescription, privacy: .public)")
                }
            }
            if entityLoads[messageID]?.token == token { entityLoads.removeValue(forKey: messageID) }
        }
        entityLoads[messageID] = EntityLoad(token: token, task: task)
    }

    /// Whether a mounted surface lists the message: the deepest open Chat or
    /// the canvas it covers, including their inline-reply chains.
    private func isShown(_ messageID: String) -> Bool {
        let shown = Set(OpenChatPages.toRefresh(focusedChatID: openChatID, canvasChatID: canvasChatID))
        return transcripts.keys(listing: messageID).contains { shown.contains($0.chatID) }
    }

    /// A Chat came on screen: read the entities that changed while it was
    /// off screen, and reload its pages if a restart passed it by.
    func revealTranscript(chatID: String) async {
        if staleTranscriptChatIDs.remove(chatID) != nil {
            await reseedLoadedPages(chatID: chatID)
        }
        for refresh in staleEntities where isShown(refresh.messageID) {
            readEntity(refresh)
        }
    }

    // MARK: - Bulk recovery

    /// Reloads the loaded pages of every open transcript (never per entity),
    /// which rewrites their entities and parent Thread anchors, then reads
    /// each tail. Lists off screen are marked to reload when shown.
    func recoverOpenTranscripts() async {
        let readStart = realtimeReconciliation.beginRead()
        defer { realtimeReconciliation.landed(.openTranscripts, readStartedAt: readStart) }
        let open = OpenChatPages.toRefresh(focusedChatID: openChatID, canvasChatID: canvasChatID)
        let openSet = Set(open)
        staleTranscriptChatIDs.formUnion(transcripts.lists.keys.map(\.chatID).filter { !openSet.contains($0) })
        await withTaskGroup(of: Void.self) { group in
            for chatID in open {
                group.addTask { await self.reseedLoadedPages(chatID: chatID) }
            }
        }
    }

    /// Re-reads every loaded page of the Chat's lists from their first loaded
    /// sequence forward, then tail-reads them. A Chat with nothing loaded
    /// loads its newest page.
    func reseedLoadedPages(chatID: String) async {
        let keys = transcripts.keys(chatID: chatID)
        guard !keys.isEmpty else {
            await loadMessages(chatID: chatID)
            return
        }
        await withTaskGroup(of: Void.self) { group in
            for key in keys {
                group.addTask { await self.reseed(key) }
            }
        }
        requestTail(chatID: chatID, through: .max)
    }

    private func reseed(_ key: TranscriptKey) async {
        guard let serverID = activeServer?.id,
              let page = transcripts.page(key),
              let first = page.messages.first?.sequence,
              let last = page.messages.last?.sequence
        else { return }
        var after = first - 1
        while after < last, !Task.isCancelled {
            beginListRead(chatID: key.chatID)
            defer { settleListRead(chatID: key.chatID) }
            guard let read: ChatMessagePage = try? await client.query("chat.messages", input: ChatMessagesInput(
                serverId: serverID, chatId: key.chatID, limit: ChatHistoryWindow.defaultPageSize,
                afterSequence: after, replyRootMessageId: key.replyRootMessageID
            )), !Task.isCancelled, activeServer?.id == serverID else { return }
            writeTranscript(read, to: key, as: .reseed)
            guard read.nextAfterSequence != nil, read.scannedThroughSequence > after else { return }
            after = read.scannedThroughSequence
        }
    }

    // MARK: - Purges

    /// `chat.onLifecycle` `deleted`: no list, entity, read, pending row, or
    /// Cloud Agent row of the Chat survives, and a late read writes nothing.
    func purgeChat(_ chatID: String) {
        deletedChatIDs.insert(chatID)
        for key in transcripts.keys(chatID: chatID) {
            for messageID in transcripts.lists[key]?.messageIDs ?? [] {
                entityLoads.removeValue(forKey: messageID)?.task.cancel()
            }
        }
        transcriptReads.purge(chatID: chatID)
        staleEntities = staleEntities.filter { $0.chatID != chatID }
        staleTranscriptChatIDs.remove(chatID)
        publishTranscripts(transcripts.removeLists { $0.chatID == chatID })
        inlineReplyChatIDByRootID = inlineReplyChatIDByRootID.filter { $0.value != chatID }
        pendingMessagesByChatID.removeValue(forKey: chatID)
        cloudAgentWorkByChatID.removeValue(forKey: chatID)
        historyNavigation.followingLatest.removeValue(forKey: chatID)
        historyNavigation.visibleSequences.removeValue(forKey: chatID)
    }

    /// Cancels every targeted read; a cancelled read writes nothing.
    func cancelTranscriptReads() {
        entityLoads.values.forEach { $0.task.cancel() }
        entityLoads = [:]
        transcriptReads.reset()
    }

    /// A Server change or loss: nothing of the old Server's transcripts stays.
    func resetTranscripts() {
        cancelTranscriptReads()
        staleEntities = []
        staleTranscriptChatIDs = []
        deletedChatIDs = []
        threadFollowOverlay = [:]
        publishTranscripts(transcripts.removeLists { _ in true })
    }
}
