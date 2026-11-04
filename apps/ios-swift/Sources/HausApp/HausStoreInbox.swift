import Foundation
import HausModels
import OSLog

/// The Server-wide reads the Inbox and its sidebar dot stand on: the Chat
/// list's unread Chats, the unread Threads (`HausStoreUnreadThreads.swift`),
/// the reader's Task items, the Cloud Agent work running right now, and the
/// Server's token-usage snapshot.
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
        async let tasks: Void = loadTaskInbox()
        async let work: Void = loadActiveCloudAgentWork()
        async let usage: Void = loadServerUsage()
        _ = await (chats, tasks, work, usage)
    }

    /// Mark read on one Unread row, a Chat's or a Thread's.
    func markInboxRowRead(id: String) async {
        if unreadThreads?.contains(where: { $0.threadChatID == id }) == true {
            await markThreadRead(threadChatID: id)
        } else {
            await markChatRead(chatID: id)
        }
    }

    /// Mark read on one Chat row: it leaves at once, the Server advances the
    /// read marker through the Chat's newest message with the same
    /// `chat.markRead` an open transcript sends, and a Chat-list refetch
    /// reconciles before the row is allowed back. `includeThreads` also reads
    /// every Thread under it, so the Chat's Thread rows leave with it. A
    /// failed Mark read puts the rows back, because nothing was recorded.
    func markChatRead(chatID: String) async {
        guard let serverID = activeServer?.id,
              let chat = chats.first(where: { $0.id == chatID })
        else { return }
        let sequence = chat.lastMessageSequence
        let childThreads = (unreadThreads ?? []).filter { $0.parentChatID == chatID }
        markedReadThrough[chatID] = sequence
        for thread in childThreads {
            markedReadThrough[thread.threadChatID] = thread.lastMessageSequence
        }
        defer {
            markedReadThrough[chatID] = nil
            for thread in childThreads { markedReadThrough[thread.threadChatID] = nil }
        }
        do {
            let _: ChatReadReceipt = try await client.mutation(
                "chat.markRead",
                input: ChatReadInput(
                    chatID: chatID,
                    sequence: sequence,
                    serverID: serverID,
                    includeThreads: true
                )
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
    /// instead of opening it — the same Chats, Threads, and Task items the
    /// section lists. Nil until the Chat list has landed, so "nothing unread"
    /// is never confused with "not yet known".
    var unreadChatCount: Int? {
        guard let unreadChats else { return nil }
        return unreadChats.count + visibleUnreadThreads.count + visibleTaskInboxItems.count
    }

    // MARK: - Task items

    /// The reader's Task items, less any clear or resolution still settling.
    var visibleTaskInboxItems: [TaskInboxItem] {
        let settling = taskSnapshots.settlingInboxTaskIDs
        return (taskSnapshots.inboxItems ?? []).filter { !settling.contains($0.id) }
    }

    /// One read for every item. Start, Done, and the status menu reach a
    /// board's columns, which an item does not carry, so the first item brings
    /// the board list with it: one more read, never one per row.
    func loadTaskInbox() async {
        guard let serverID = activeServer?.id else { return }
        let readStart = realtimeReconciliation.beginRead()
        do {
            let list: TaskInboxList = try await client.query(
                "taskInbox.list",
                input: ServerScopedInput(serverId: serverID)
            )
            guard activeServer?.id == serverID,
                  realtimeReconciliation.landed(.taskInbox, readStartedAt: readStart)
            else { return }
            if taskSnapshots.inboxItems != list.items { taskSnapshots.inboxItems = list.items }
            if !list.items.isEmpty, taskSnapshots.boards == nil { try await reloadBoards() }
        } catch {
            Self.logger.error("Loading the task inbox failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Mark read, or opening the Task: the item leaves at once without the
    /// Task moving. A failed clear puts it back, because nothing was recorded.
    func clearTaskInboxItem(taskID: String) async throws {
        let serverID = try activeServerID()
        taskSnapshots.settlingInboxTaskIDs.insert(taskID)
        defer { taskSnapshots.settlingInboxTaskIDs.remove(taskID) }
        let _: TaskInboxMutationResult = try await client.mutation(
            "taskInbox.clear",
            input: TaskInboxItemInput(serverID: serverID, taskID: taskID)
        )
        taskSnapshots.inboxItems?.removeAll { $0.id == taskID }
    }

    /// Opening a Task clears its item, whichever surface opened it. Nothing is
    /// sent for a Task the reader's Inbox is known not to hold; before the
    /// first read, as on a cold launch from a push, the clear goes out anyway
    /// and is a no-op on the Server if there was no item.
    func clearTaskInboxItemOnOpen(taskID: String) async {
        guard taskSnapshots.inboxItems?.contains(where: { $0.id == taskID }) ?? true else { return }
        do {
            try await clearTaskInboxItem(taskID: taskID)
        } catch {
            Self.logger.error("Clearing a task item failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Start, Done, Won't do, or the status menu: moves the Task, which clears
    /// the assignee's own item on the Server. The receipt is what an Undo
    /// moves back from.
    func moveTaskInboxItem(taskID: String, toColumnID columnID: String) async throws -> BoardTask {
        guard let task = taskSnapshots.inboxItems?.first(where: { $0.id == taskID })?.task else {
            throw HausStoreError.serverUnavailable
        }
        guard task.columnID != columnID else { return task }
        taskSnapshots.settlingInboxTaskIDs.insert(taskID)
        defer { taskSnapshots.settlingInboxTaskIDs.remove(taskID) }
        let moved = try await moveTask(task, toColumnID: columnID)
        taskSnapshots.inboxItems?.removeAll { $0.id == taskID }
        return moved
    }

    /// Undo: moves the Task back if a move cleared it, then restores the item.
    /// The restore comes last, because the assignee moving their own Task
    /// clears the item again.
    func undoTaskInboxClear(taskID: String, moved: BoardTask?, previousColumnID: String?) async throws {
        let serverID = try activeServerID()
        if let moved, let previousColumnID {
            try await moveTask(moved, toColumnID: previousColumnID)
        }
        let _: TaskInboxMutationResult = try await client.mutation(
            "taskInbox.restore",
            input: TaskInboxItemInput(serverID: serverID, taskID: taskID)
        )
        await loadTaskInbox()
    }

    /// The item's composer: a reply in a Thread on its context message, so
    /// discussion lands where the Task already lives and in its Mentioned in.
    /// A context message that is itself a Thread reply answers in that Thread.
    func replyToTaskInboxItem(taskID: String, content: String) async -> Bool {
        guard let message = taskSnapshots.inboxItems?.first(where: { $0.id == taskID })?.contextMessage else {
            return false
        }
        if chatsByID[message.chatID] != nil {
            let outcome = await sendThreadReply(
                content,
                to: message.chatID,
                anchorMessageID: message.id,
                pendingChatID: threadChatID(parentChatID: message.chatID, anchorMessageID: message.id)
                    ?? pendingThreadChatID(anchorMessageID: message.id)
            )
            return outcome != .rejected
        }
        guard let serverID = activeServer?.id else { return false }
        do {
            let thread: ThreadContext = try await client.query(
                "thread.get",
                input: ThreadContextInput(serverID: serverID, threadChatID: message.chatID)
            )
            let outcome = await sendThreadReply(
                content,
                to: thread.parentChatID,
                anchorMessageID: thread.anchorMessageID,
                pendingChatID: thread.threadChatID
            )
            return outcome != .rejected
        } catch {
            Self.logger.error("Replying from the Inbox failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    /// Every queued or running Cloud Agent work the viewer can see on this
    /// Server, oldest first. `cloudAgentWork.onUpdated` owns the refresh.
    func loadActiveCloudAgentWork() async {
        guard let serverID = activeServer?.id else { return }
        let readStart = realtimeReconciliation.beginRead()
        do {
            let rows = try await (client.query(
                "cloudAgentWork.listActive",
                input: ServerScopedInput(serverId: serverID)
            ) as ActiveCloudAgentWorkList).rows
            guard activeServer?.id == serverID,
                  realtimeReconciliation.landed(.activeCloudAgentWork, readStartedAt: readStart)
            else { return }
            if activeCloudAgentWork != rows { activeCloudAgentWork = rows }
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
