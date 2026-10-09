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
    /// How long live delivery accumulates events before applying a batch. Short
    /// enough that a single message still lands as an immediate arrival.
    static let liveChatEventWindow = Duration.milliseconds(80)

    /// Below this time in the background, a return with healthy streams skips
    /// the full snapshot: the focus stale window of specs/realtime-events.md.
    static let quickReturnInterval: TimeInterval = 180

    /// Reads every snapshot projection concurrently.
    ///
    /// Computers are deliberately left to `loadComputers`, which owns its own
    /// role-denied fallback: no Chat surface observes that field, so its write
    /// neither joins the batched apply nor holds it up.
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
        // Not awaited: no Chat surface reads Computers, so the snapshot does
        // not wait on them.
        Task { await self.loadComputers(serverID: serverID) }
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

        // Still showing the disk paint: finishing the launch is the refresh.
        // A pending retry runs now; without one the first load is in flight.
        guard hasLiveServerState else {
            guard let retry = launchRetry else { return }
            retry.cancel()
            launchRetry = nil
            await loadLiveServer(attempt: 0)
            return
        }

        // A short trip away leaves healthy streams standing: any frame missed
        // while suspended is still in the socket, and a dropped socket
        // reconnects and reloads its own projections.
        if streamsHealthy, isConnected,
           let backgroundedAt,
           Date().timeIntervalSince(backgroundedAt) < Self.quickReturnInterval {
            await refreshIconBadge()
            return
        }

        foregroundRefreshInFlight = true
        defer { foregroundRefreshInFlight = false }
        // Suspension most likely killed the sockets. Fresh streams subscribe
        // first and the snapshot reads after, so nothing committed in between
        // is missed; a fresh stream's first connect reloads nothing the
        // snapshot is about to read.
        startEventStreams(serverID: serverID)

        do {
            try await refreshServerSnapshot(serverID: serverID)
            markConnected()
        } catch {
            markDisconnected()
            Self.logger.error("Foreground refresh failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Reads the durable Server projections concurrently and applies them in one
    /// pass, so a foreground or reconnect lands as a single repaint rather than
    /// a stagger of half-updated lists.
    func refreshServerSnapshot(serverID: String) async throws {
        let lifecycleRevisionAtStart = lifecycleRevision
        async let iconBadge: Void = refreshIconBadge()
        let snapshot = try await fetchServerSnapshot(serverID: serverID)
        apply(snapshot, lifecycleRevisionAtStart: lifecycleRevisionAtStart)
        await iconBadge

        // Every Chat surface on the user's stack reloads its loaded pages in
        // bulk, not just the deepest one: a pushed Thread covers its parent
        // Chat, and popping back to a page that is one round trip stale
        // flashes pre-background content through the pop animation. Every
        // other cached list reloads when `openChat` shows it again.
        await recoverOpenTranscripts()
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
}
