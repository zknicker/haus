import Foundation
import HausModels
import HausUI
import OSLog

/// One foreground or reconnect read of the durable Server projections the shell
/// renders, gathered before anything is applied.
///
/// Applying these fields as they land repaints the shell several times against
/// half-updated state: an Agent list from after the refresh beside a Chat list
/// from before it, and an activity projection derived from whichever Agent list
/// happened to be in place. Gathering first makes the apply one pass.
struct ServerSnapshot: Sendable {
    let servers: [ServerSummary]
    let chats: [ChatSummary]
    let agents: [AgentSummary]
    let members: MemberList
    /// Nil when the projection could not be read. Lifecycle availability stays
    /// authoritative for the working dot, so a transient failure keeps the
    /// activity the shell already has rather than clearing it.
    let activity: AgentActiveActivitySnapshot?
}

extension HausStore {
    private static let realtimeLogger = Logger(
        subsystem: "chat.haus.ios",
        category: "chat-realtime"
    )

    /// How long live delivery accumulates events before applying a batch. Short
    /// enough that a single message still lands as an immediate arrival.
    static let liveChatEventWindow = Duration.milliseconds(80)

    /// Reads every snapshot projection concurrently.
    ///
    /// Computers are deliberately left to `loadComputers`, which owns its own
    /// role-denied fallback: no Chat surface observes that field, so its write
    /// does not need to join the batched apply.
    func fetchServerSnapshot(serverID: String) async throws -> ServerSnapshot {
        async let loadedServers: [ServerSummary] = client.query("server.list")
        async let loadedChats: [ChatSummary] = client.query(
            "chat.list",
            input: ServerScopedInput(serverId: serverID)
        )
        async let loadedAgents: [AgentSummary] = client.query(
            "agent.list",
            input: ServerScopedInput(serverId: serverID)
        )
        async let loadedMembers: MemberList = client.query(
            "member.list",
            input: ServerScopedInput(serverId: serverID)
        )
        async let loadedActivity: AgentActiveActivitySnapshot? = fetchActiveActivity(
            serverID: serverID
        )
        async let loadedComputers: Void = loadComputers(serverID: serverID)

        await loadedComputers
        return try await ServerSnapshot(
            servers: loadedServers,
            chats: loadedChats,
            agents: loadedAgents,
            members: loadedMembers,
            activity: loadedActivity
        )
    }

    /// Rehydrates durable Server state after iOS suspends the app.
    ///
    /// Subscriptions are notification streams, not a durable history. Refetching
    /// the canonical lists and the open message page prevents a foregrounded app
    /// from presenting a stale cache while the streams reconnect.
    ///
    /// This is a voluntary refresh, so it keeps the connected state: dropping it
    /// slid the offline banner over the composer on every single foreground.
    /// Offline is what a failed refresh or a broken stream reports.
    func resumeAfterForeground() async {
        guard case .loaded = state,
              !foregroundRefreshInFlight,
              let serverID = activeServer?.id
        else { return }

        foregroundRefreshInFlight = true
        defer { foregroundRefreshInFlight = false }
        stopEventStreams()

        do {
            try await refreshServerSnapshot(serverID: serverID)
            startEventStreams(serverID: serverID)
            markConnected()
        } catch {
            markDisconnected()
            sendError = error.localizedDescription
            Self.logger.error("Foreground refresh failed: \(error.localizedDescription, privacy: .public)")
            startEventStreams(serverID: serverID)
        }
    }

    /// Reads the durable Server projections concurrently and applies them in one
    /// pass, so a foreground or reconnect lands as a single repaint rather than
    /// a stagger of half-updated lists.
    func refreshServerSnapshot(serverID: String) async throws {
        let lifecycleRevisionAtStart = lifecycleRevision
        let snapshot = try await fetchServerSnapshot(serverID: serverID)
        apply(snapshot, lifecycleRevisionAtStart: lifecycleRevisionAtStart)
        await refreshInlineReplies()

        // Every Chat surface on the user's stack is refetched eagerly, not just
        // the deepest one: a pushed Thread covers its parent Chat, and popping
        // back to a page that is one round trip stale flashes pre-background
        // content through the pop animation. Every other cached page is
        // refreshed by the event walk that follows this snapshot, by live
        // events, and by `openChat` when the user navigates back to it.
        for chatID in OpenChatPages.toRefresh(
            focusedChatID: openChatID,
            canvasChatID: canvasChatID
        ) {
            await loadMessages(chatID: chatID)
        }
        // Reads belong to the deepest surface alone. A covered canvas Chat was
        // refreshed above but is not what the user is looking at.
        if let openChatID {
            await markChatReadIfNeeded(chatID: openChatID)
        }
    }

    /// The Chat-list and directory assignments below pass through a
    /// `HausStore` setter that drops equal-value writes and retires the
    /// projections that field feeds, so a snapshot that changed nothing
    /// repaints nothing. `servers` is plain storage and guards its own write.
    private func apply(_ snapshot: ServerSnapshot, lifecycleRevisionAtStart: Int) {
        if servers.first?.id != snapshot.servers.first?.id {
            resetInlineReplyCache()
        }
        if servers != snapshot.servers { servers = snapshot.servers }
        chats = snapshot.chats
        agents = snapshot.agents
        members = snapshot.members
        // The live overlay outranks `agent.list` only when a lifecycle event
        // landed while the snapshot was in flight. Clearing it unconditionally
        // traded live presence for a list read that may already be older.
        clearLifecycleAvailability(ifRevisionIs: lifecycleRevisionAtStart)
        // Activity is derived from the Agent list and its availability, so it
        // applies after both.
        if let activity = snapshot.activity {
            replaceActiveActivitySnapshot(activity)
        }
    }

    func handle(chatEvent event: ChatEvent, serverID: String) async {
        markConnected()
        await bufferLiveChatEvent(event, serverID: serverID)
    }

    /// Live delivery arrives one SSE frame at a time and each event fans out
    /// into Server refetches, so a burst — an Agent posting a run of messages, a
    /// reconnect echo — became one refetch and one shell repaint per frame.
    /// Coalescing gives the live path the batched shape the catch-up walk
    /// already has, without changing when events are consumed.
    func bufferLiveChatEvent(_ event: ChatEvent, serverID: String) async {
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

    /// Drains whatever a window is still holding before its stream goes away.
    /// The applier is async and this runs from synchronous teardown, so the
    /// buffer is emptied here and the batch handed to a task the stream bag
    /// does not own — cancelling the streams must not cancel their last batch.
    func flushLiveChatEventsBeforeTeardown() {
        cancelScheduledLiveChatEventFlush()
        let batch = liveChatEvents.drain()
        guard !batch.isEmpty, let serverID = chatEventServerID else { return }
        Task { [weak self] in
            await self?.applyChatEvents(batch, serverID: serverID)
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

    /// Recovers the durable Chat log while the live SSE subscription is
    /// starting or reconnecting. The SSE connection is established first;
    /// this walk then completes before its buffered live events are consumed,
    /// closing the reconnect gap without losing events that arrive meanwhile.
    func catchUpChatEvents(serverID: String) async {
        guard !Task.isCancelled, activeServer?.id == serverID else { return }
        if chatEventCatchUpInFlight {
            chatEventCatchUpPending = true
            return
        }

        chatEventCatchUpInFlight = true
        defer { chatEventCatchUpInFlight = false }

        repeat {
            chatEventCatchUpPending = false
            await performChatEventCatchUp(serverID: serverID)
        } while chatEventCatchUpPending && !Task.isCancelled
    }

    private func performChatEventCatchUp(serverID: String) async {
        guard !Task.isCancelled, activeServer?.id == serverID else { return }

        do {
            if chatEventReplay.cursor == "0" {
                let head: ChatEventHead = try await client.query(
                    "chat.eventHead",
                    input: ServerScopedInput(serverId: serverID)
                )
                guard !Task.isCancelled, activeServer?.id == serverID else { return }
                try await refreshServerSnapshot(serverID: serverID)
                // The snapshot is the proof that every event through `head`
                // is represented locally. Keep cursor zero when it fails so
                // the next connection retries the cold-start recovery.
                chatEventReplay.advance(to: head.cursor)
                return
            }

            let (events, walkedCursor) = try await walkChatEvents(
                serverID: serverID,
                afterCursor: chatEventReplay.cursor
            )
            guard !Task.isCancelled, activeServer?.id == serverID else { return }
            await applyChatEvents(events, serverID: serverID)
            chatEventReplay.advance(to: walkedCursor)
        } catch is CancellationError {
            return
        } catch {
            sendError = error.localizedDescription
            Self.realtimeLogger.error(
                "Chat event catch-up failed: \(error.localizedDescription, privacy: .public)"
            )
        }
    }

    private func walkChatEvents(
        serverID: String,
        afterCursor: String
    ) async throws -> ([ChatEvent], String) {
        let pageSize = 100
        var cursor = afterCursor
        var events: [ChatEvent] = []

        while !Task.isCancelled {
            let page: [ChatEvent] = try await client.query(
                "chat.events",
                input: ChatEventsInput(
                    afterCursor: cursor,
                    limit: pageSize,
                    serverId: serverID
                )
            )
            guard !page.isEmpty else { break }
            events.append(contentsOf: page)
            if let lastCursor = page.last?.cursor {
                cursor = ChatEventCursor.later(cursor, lastCursor)
            }
            if page.count < pageSize {
                break
            }
        }

        return (events, cursor)
    }
}
