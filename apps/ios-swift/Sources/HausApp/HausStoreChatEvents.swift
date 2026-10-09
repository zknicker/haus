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
        for refresh in effects.entityRefreshes where !deletedChatIDs.contains(refresh.chatID) {
            refreshEntity(refresh)
        }
        for messageID in effects.liveReactionMessageIDs {
            reactionStickers.noteLive(messageID: messageID, eventAt: .now)
        }
        if !effects.changedLabelIDs.isEmpty {
            reloadForLabelChanges(effects.changedLabelIDs)
        }
        for chatID in effects.cloudAgentWorkChatIDs where cloudAgentWorkByChatID[chatID] != nil {
            Task { await self.loadCloudAgentWork(serverID: serverID, chatID: chatID) }
        }

        let unreadByChatID = Dictionary(chats.map { ($0.id, $0.unreadCount) }, uniquingKeysWith: max)
        let readsChatList = effects.needsChatListRead { unreadByChatID[$0] }
        // Inbox snapshots refresh only when this client already holds them:
        // an event must not start a Server-wide read nobody has opened.
        let readsTasks = effects.reloadsServerTasks && serverTasks != nil
        let readsWork = effects.reloadsActiveCloudAgentWork && activeCloudAgentWork != nil
        await withTaskGroup(of: Void.self) { group in
            if readsChatList { group.addTask { await self.refreshChatList(serverID: serverID) } }
            if readsTasks { group.addTask { await self.loadServerTasks() } }
            if readsWork { group.addTask { await self.loadActiveCloudAgentWork() } }
        }
    }

    /// A label carries no message ids: refresh every cached entity carrying
    /// it (marked dirty, so a list read in flight re-reads it as it settles),
    /// then reload the Server's open lists in bulk.
    private func reloadForLabelChanges(_ labelIDs: Set<String>) {
        for refresh in Set(labelIDs.flatMap(transcripts.refreshes(carryingLabel:))) {
            refreshEntity(refresh)
        }
        Task { await self.recoverOpenTranscripts() }
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

    // MARK: - Restart recovery

    /// A restarted stream reloads the projections it owns. Several streams
    /// restarting together (a dropped connection) share one pass, so each
    /// open list reloads once.
    func requestRecovery(_ projections: Set<RealtimeProjection>, serverID: String) {
        pendingRecovery.formUnion(projections)
        guard recoveryFlush == nil else { return }
        recoveryFlush = Task { [weak self] in
            try? await Task.sleep(for: HausStore.liveChatEventWindow)
            guard !Task.isCancelled, let self else { return }
            let projections = pendingRecovery
            pendingRecovery = []
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
            if projections.contains(.taskLenses), serverTasks != nil {
                group.addTask { await self.loadServerTasks() }
            }
            if projections.contains(.activeCloudAgentWork) {
                if activeCloudAgentWork != nil {
                    group.addTask { await self.loadActiveCloudAgentWork() }
                }
                for chatID in OpenChatPages.toRefresh(focusedChatID: openChatID, canvasChatID: canvasChatID) {
                    group.addTask { await self.loadCloudAgentWork(serverID: serverID, chatID: chatID) }
                }
            }
            if projections.contains(.agentAvailability) {
                group.addTask { await self.reloadAgentAvailability(serverID: serverID) }
            }
            if projections.contains(.agentActivity) {
                group.addTask { await self.reloadActiveActivity(serverID: serverID) }
            }
        }
    }
}
