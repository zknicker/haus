import Foundation
import HausModels
import OSLog

/// The Server-wide reads the Inbox and its sidebar dot stand on: the Chat
///
/// Each snapshot lives on the Store rather than on a screen because the dot
/// outlives the Inbox: a durable event refreshes what this client already
/// holds, and nothing here pulls in a read nobody has asked for. A failed
/// refresh keeps the previous snapshot and is logged — a stale Inbox row is
/// honest, while a Chat-level send alert for a background read is not.
extension HausStore {
    /// Every Server-wide Inbox read at once, for a surface that shows all of
    /// them. The reads are independent, so they run concurrently.
    func loadInbox() async {
        async let chats: Void = refreshInboxChats()
        async let unreadTasks: Void = loadUnreadTasks()
        async let work: Void = loadActiveWorkers()
        async let usage: Void = loadServerUsage()
        _ = await (chats, unreadTasks, work, usage)
    }

    func markInboxRowRead(id: String) async {
        if isUnreadTaskChat(id) {
            await markTaskChatRead(chatID: id)
        } else {
            await markChatRead(chatID: id)
        }
    }

    /// Mark read on one Chat row: it leaves at once, the Server advances the
    /// read marker through the Chat's newest message with the same
    /// `chat.markRead` an open transcript sends, and a Chat-list refetch
    func markChatRead(chatID: String) async {
        guard let serverID = activeServer?.id,
              let chat = chats.first(where: { $0.id == chatID })
        else { return }
        let sequence = chat.lastMessageSequence
        markedReadThrough[chatID] = sequence
        defer { markedReadThrough[chatID] = nil }
        do {
            let _: ChatReadReceipt = try await client.mutation(
                "chat.markRead",
                input: ChatReadInput(chatID: chatID, sequence: sequence, serverID: serverID)
            )
            guard activeServer?.id == serverID else { return }
            try await reloadChats(serverID: serverID)
        } catch {
            Self.logger.error("Marking chat read failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// The Chats the Inbox lists as unread: the Chat list's, less any Mark
    /// read still settling. Nil until the Chat list has landed.
    var unreadChats: [ChatSummary]? {
        guard hasLoadedChats else { return nil }
        return UnreadChats.visible(chats, markedReadThrough: markedReadThrough)
    }

    /// How many Unread rows there are, for surfaces that mark the Inbox
    var unreadChatCount: Int? {
        guard let unreadChats else { return nil }
        return unreadChats.count + visibleUnreadTasks.count
    }

    /// Every queued or running Cloud Agent work the viewer can see on this
    /// Server, oldest first. `cloudAgentWork.onUpdated` owns the refresh.
    func loadActiveWorkers() async {
        guard let serverID = activeServer?.id else { return }
        let readStart = realtimeReconciliation.beginRead()
        do {
            let rows = try await (client.query(
                "worker.listActive",
                input: ServerScopedInput(serverId: serverID)
            ) as ActiveWorkerList).rows
            guard activeServer?.id == serverID,
                  realtimeReconciliation.landed(.activeWorkers, readStartedAt: readStart)
            else { return }
            if activeWorkers != rows { activeWorkers = rows }
        } catch {
            Self.logger.error("Loading active cloud agent work failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// The Chat list is part of the shell's own snapshot and durable events
    /// keep it fresh; a pull on the Inbox asks for it again all the same.
    private func refreshInboxChats() async {
        guard let serverID = activeServer?.id else { return }
        do {
            try await reloadChats(serverID: serverID)
        } catch {
            Self.logger.error("Loading chats failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// One Server-wide usage read the Inbox slices per Agent through
    /// `AgentTokenUsage.summarize`. Ranking a week is a question about every
    /// Agent at once, so a per-Agent read was never the right shape for it.
    func loadServerUsage() async {
        guard let serverID = activeServer?.id else { return }
        let readStart = realtimeReconciliation.beginRead()
        do {
            let snapshot: ServerUsageSnapshot = try await client.query(
                "stats.live",
                input: ServerScopedInput(serverId: serverID)
            )
            guard activeServer?.id == serverID,
                  realtimeReconciliation.landed(.serverUsage, readStartedAt: readStart)
            else { return }
            if serverUsage != snapshot { serverUsage = snapshot }
        } catch {
            Self.logger.error("Loading server usage failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// One Agent's week, sliced from the Server usage snapshot the Inbox
    /// already holds. Nil until that read lands, so a strip is blank rather
    /// than ranked against a half-loaded window.
    func agentUsageWeek(agentID: String, asOf: Date = Date()) -> AgentUsageSummary? {
        guard let serverUsage else { return nil }
        return AgentTokenUsage.summarize(serverUsage.tokenUsage, agentID: agentID, asOf: asOf)
    }
}
