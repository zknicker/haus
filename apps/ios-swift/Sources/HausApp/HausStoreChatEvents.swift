import Foundation
import HausModels
import HausUI

/// Live Chat events from the focused streams, and the stream-restart
/// recovery of the projections each stream owns.
///
/// Events buffer for one short window (`ChatEventCoalescer`), so an Agent
/// posting a run of messages costs one tail read per list, one read per
/// changed message, and one Chat list read. `ChatRealtimeEffects` turns the
/// batch into those reads through one small handler per event kind.
extension HausStore {
    func receive(_ event: ChatRealtimeEvent, serverID: String) async {
        markConnected()
        switch liveChatEvents.buffer(event) {
        case .scheduleFlush:
            scheduleLiveChatEventFlush(serverID: serverID)
        case .awaitScheduledFlush:
            break
        case .flushNow:
            cancelScheduledLiveChatEventFlush()
            await flushLiveChatEvents(serverID: serverID)
        }
    }

    /// Drains whatever a window is still holding before its streams go away.
    /// The applier is async and this runs from synchronous teardown, so the
    /// batch goes to a task the stream bag does not own: cancelling the
    /// streams must not cancel their last batch.
    func flushLiveChatEventsBeforeTeardown() {
        cancelScheduledLiveChatEventFlush()
        let batch = liveChatEvents.drain()
        guard !batch.isEmpty, let serverID = realtimeServerID else { return }
        Task { [weak self] in
            await self?.applyChatEvents(batch, serverID: serverID)
        }
    }

    /// Runs the reads one batch of events asks for. Deletions purge first, so
    /// nothing reads a deleted Chat; everything else runs side by side.
    func applyChatEvents(_ events: [ChatRealtimeEvent], serverID: String) async {
        guard activeServer?.id == serverID else { return }
        let effects = ChatRealtimeEffects(events, serverID: serverID)
        guard !effects.isEmpty else { return }

        effects.deletedChatIDs.forEach(purgeChat)
        for (chatID, sequence) in effects.tailSequenceByChatID where !deletedChatIDs.contains(chatID) {
            requestTail(chatID: chatID, through: sequence)
        }
        // A work change reaches every loaded Message that links it, not only
        // the linking Messages the Server's events named.
        let entityRefreshes = effects.entityRefreshes
            .union(transcripts.refreshes(carryingWorkers: effects.cloudAgentWorkIDs))
        for refresh in entityRefreshes where !deletedChatIDs.contains(refresh.chatID) {
            refreshEntity(refresh)
        }
        for messageID in effects.liveReactionMessageIDs {
            reactionStickers.noteLive(messageID: messageID, eventAt: .now)
        }
        let unreadByChatID = Dictionary(chats.map { ($0.id, $0.unreadCount) }, uniquingKeysWith: max)
        let readsChatList = effects.needsChatListRead { unreadByChatID[$0] }
        // Inbox snapshots refresh only when this client already holds them:
        // an event must not start a Server-wide read nobody has opened.
        let readsWork = effects.reloadsActiveWorkers && activeWorkers != nil
        await withTaskGroup(of: Void.self) { group in
            if readsChatList { group.addTask { await self.refreshChatList(serverID: serverID) } }
            if readsWork { group.addTask { await self.loadActiveWorkers() } }
            group.addTask { await self.applyTaskEffects(effects) }
            group.addTask { await self.applyTaskPlaceEffects(effects) }
        }
        // Mounted search reruns on new messages, after the Chat list it maps
        // results against is current.
        if !effects.tailSequenceByChatID.isEmpty, activeServer?.id == serverID {
            messageSearchRevision += 1
        }
    }

    private func scheduleLiveChatEventFlush(serverID: String) {
        liveChatEventFlush?.cancel()
        liveChatEventFlush = Task { [weak self] in
            try? await Task.sleep(for: HausStore.liveChatEventWindow)
            guard !Task.isCancelled else { return }
            await self?.flushLiveChatEvents(serverID: serverID)
        }
    }

    private func cancelScheduledLiveChatEventFlush() {
        liveChatEventFlush?.cancel()
        liveChatEventFlush = nil
    }

    private func flushLiveChatEvents(serverID: String) async {
        liveChatEventFlush = nil
        let batch = liveChatEvents.drain()
        guard !batch.isEmpty else { return }
        await applyChatEvents(batch, serverID: serverID)
    }

    // MARK: - Start reconciliation

    /// A started stream reconciles the projections it owns, anchored to now.
    /// Streams starting together (a launch, a foreground, a dropped
    /// connection) share one pass, so each open list reloads once, and a
    /// projection a read begun after the start already answered is skipped.
    func requestRecovery(_ projections: Set<RealtimeProjection>, serverID: String) {
        realtimeReconciliation.streamStarted(reconciling: projections)
        guard recoveryFlush == nil else { return }
        recoveryFlush = Task { [weak self] in
            try? await Task.sleep(for: HausStore.liveChatEventWindow)
            guard !Task.isCancelled, let self else { return }
            let projections = realtimeReconciliation.take()
            recoveryFlush = nil
            guard activeServer?.id == serverID else { return }
            await recover(projections, serverID: serverID)
        }
    }

    private func recover(_ projections: Set<RealtimeProjection>, serverID: String) async {
        await withTaskGroup(of: Void.self) { group in
            if projections.contains(.openTranscripts) {
                group.addTask { await self.recoverOpenTranscripts() }
            }
            if projections.contains(.chatList) {
                group.addTask { await self.refreshChatList(serverID: serverID) }
            }
            if projections.contains(.serverList) {
                group.addTask { await self.reloadServerList(serverID: serverID) }
            }
            group.addTask { await self.recoverTaskProjections(projections) }
            if projections.contains(.unreadTasks), taskSnapshots.unreadTasks != nil {
                group.addTask { await self.loadUnreadTasks() }
            }
            if projections.contains(.activeWorkers), activeWorkers != nil {
                group.addTask { await self.loadActiveWorkers() }
            }
            if projections.contains(.agentAvailability) {
                group.addTask { await self.reloadAgentAvailability(serverID: serverID) }
            }
            // An availability reload re-reads activity after the Agent list
            // it is derived from, so a second read would only race it.
            if projections.contains(.agentActivity), !projections.contains(.agentAvailability) {
                group.addTask { await self.reloadActiveActivity(serverID: serverID) }
            }
            if projections.contains(.serverUsage), serverUsage != nil {
                group.addTask { await self.loadServerUsage() }
            }
            if projections.contains(.computers) {
                group.addTask { await self.loadComputers(serverID: serverID) }
            }
        }
    }
}
