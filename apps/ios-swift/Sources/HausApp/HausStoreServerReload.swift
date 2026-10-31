import Foundation
import HausModels
import HausTransport
import HausUI

/// The launch: paint the last rendered state from disk, then load the live
/// Server and reconcile.
///
/// The live chain is two steps — `server.list`, then the Chat list, Agent
/// list, and identity-synced member list together, with the pages the first
/// frame shows. The focused streams start after it. Nothing replays, so each
/// stream's first connect reconciles what it owns against these reads, in one
/// shared pass: the message stream tail-reads each loaded list, and the
/// annotation streams reload open transcripts and the Chat list. Computers and
/// the badge load after the shell is up; no Chat surface waits on them, and
/// the streams' own connects reload activity and presence.
extension HausStore {
    func start() async {
        guard case .idle = state else { return }
        let painted = await restoreLaunchSnapshot()
        if !painted { state = .loading }
        await loadLiveServer(attempt: 0)
    }

    func retry() async {
        stopEventStreams()
        launchRetry?.cancel()
        launchRetry = nil
        state = .idle
        await start()
    }

    func loadLiveServer(attempt: Int) async {
        do {
            if HausRuntimeConfiguration.development != nil {
                let _: ServerSummary = try await client.mutation("server.developmentBootstrap")
            }
            let loadedServers: [ServerSummary] = try await client.query("server.list")
            if activeServer?.id != loadedServers.first?.id {
                resetInlineReplyCache()
                discardServerScopedState()
            }
            servers = loadedServers
            guard let server = loadedServers.first else {
                state = .failed("You do not have a Haus Server yet.")
                return
            }
            try await reloadServer(server.id)
            hasLiveServerState = true
            if case .loaded = state {} else { state = .loaded }
            markConnected()
            startEventStreams(serverID: server.id)
            scheduleLaunchSnapshotWrite()
            Task { await self.loadDeferredServerState(serverID: server.id) }
        } catch is CancellationError {
            return
        } catch {
            guard case .loaded = state else {
                state = .failed(error.localizedDescription)
                isConnected = false
                return
            }
            // Painted from disk: keep showing it, report the outage, retry.
            markDisconnected()
            Self.logger.error("Live launch load failed: \(error.localizedDescription, privacy: .public)")
            scheduleLaunchRetry(attempt: attempt)
        }
    }

    /// The Chat list and directory, applied together, then the pages the
    /// first frame shows. A cold launch warms its landing page here so the
    /// first frame is not an empty transcript.
    func reloadServer(_ serverID: String) async throws {
        async let loadedChats: [ChatSummary] = client.query(
            "chat.list",
            input: ServerScopedInput(serverId: serverID)
        )
        async let loadedAgents: [AgentSummary] = client.query(
            "agent.list",
            input: ServerScopedInput(serverId: serverID)
        )
        async let loadedMembers: MemberList = identitySyncedMembers(serverID: serverID)
        let (chatList, agentList, memberList) = try await (loadedChats, loadedAgents, loadedMembers)
        chats = chatList
        agents = agentList
        if !lifecycleAvailability.isEmpty { lifecycleAvailability.removeAll() }
        members = memberList

        // Every mounted surface (a disk paint may still show its old page),
        // plus a cold launch's landing Chat.
        var pages = OpenChatPages.toRefresh(focusedChatID: openChatID, canvasChatID: canvasChatID)
        let landingChatID = preferredInitialChatID
            .flatMap { preferred in chats.first { $0.id == preferred }?.id }
            ?? chats.first?.id
        if let landingChatID, messagesByChatID[landingChatID] == nil, !pages.contains(landingChatID) {
            pages.append(landingChatID)
        }
        await withTaskGroup(of: Void.self) { group in
            for chatID in pages {
                group.addTask { await self.loadMessages(chatID: chatID) }
            }
        }
    }

    /// `server.onUpdated` and its start reconciliation: the Server's name or
    /// the viewer's Server list changed. A list that no longer leads with the
    /// active Server means it was lost; that runs the membership-loss purge
    /// rather than letting another Server's id stand beside this one's state.
    func reloadServerList(serverID: String) async {
        guard activeServer?.id == serverID else { return }
        let readStart = realtimeReconciliation.beginRead()
        do {
            let loaded: [ServerSummary] = try await client.query("server.list")
            guard activeServer?.id == serverID,
                  realtimeReconciliation.landed(.serverList, readStartedAt: readStart)
            else { return }
            guard loaded.first?.id == serverID else {
                // Unstructured: the purge stops the streams and recovery
                // pass this read may be running inside.
                if !loaded.contains(where: { $0.id == serverID }) {
                    Task { await self.handleMembershipLost(serverID: serverID) }
                }
                return
            }
            if servers != loaded { servers = loaded }
        } catch is CancellationError {
            return
        } catch {
            Self.logger.warning("Server list refresh failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func loadDeferredServerState(serverID: String) async {
        async let badge: Void = refreshUnreadThreadsAndBadge()
        await loadComputers(serverID: serverID)
        await badge
    }

    /// Identity sync runs ahead of the member read so a first launch lists
    /// the viewer's sign-in name, but it is never fatal: a failure logs, the
    /// member list loads anyway, and the sync retries in the background.
    private func identitySyncedMembers(serverID: String) async throws -> MemberList {
        do {
            try await syncHumanIdentity(serverID: serverID)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            Self.logger.warning("Identity sync failed: \(error.localizedDescription, privacy: .public)")
            scheduleIdentitySyncRetry(serverID: serverID, attempt: 0)
        }
        return try await client.query("member.list", input: ServerScopedInput(serverId: serverID))
    }

    private func scheduleIdentitySyncRetry(serverID: String, attempt: Int) {
        guard attempt < 5 else { return }
        Task { [weak self] in
            try? await Task.sleep(for: RetryBackoff.delay(attempt: attempt + 1))
            guard let self, activeServer?.id == serverID else { return }
            do {
                try await syncHumanIdentity(serverID: serverID)
                let refreshed: MemberList = try await client.query(
                    "member.list",
                    input: ServerScopedInput(serverId: serverID)
                )
                guard activeServer?.id == serverID else { return }
                members = refreshed
            } catch {
                Self.logger.warning("Identity sync retry failed: \(error.localizedDescription, privacy: .public)")
                scheduleIdentitySyncRetry(serverID: serverID, attempt: attempt + 1)
            }
        }
    }

    private func scheduleLaunchRetry(attempt: Int) {
        launchRetry?.cancel()
        launchRetry = Task { [weak self] in
            try? await Task.sleep(for: RetryBackoff.delay(attempt: attempt))
            guard !Task.isCancelled, let self, !hasLiveServerState else { return }
            launchRetry = nil
            await loadLiveServer(attempt: attempt + 1)
        }
    }

    /// Server-scoped state painted for a Server the live list no longer
    /// leads with. Nothing of it may stand beside the new Server's reads.
    func discardServerScopedState() {
        guard activeServer != nil else { return }
        chats = []
        agents = []
        members = nil
        resetTranscripts()
        pendingMessagesByChatID = [:]
        cloudAgentWorkByChatID = [:]
        serverTasks = nil
        activeCloudAgentWork = nil
        unreadThreads = nil
    }
}
