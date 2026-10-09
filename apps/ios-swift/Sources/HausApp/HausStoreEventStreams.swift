import Foundation
import HausModels
import HausTransport
import OSLog

/// Starting, stopping, and restarting the Server's focused live streams
/// (specs/realtime-events.md, iPhone impact).
///
/// Each subscription is its own task. The transport reconnects transport
/// failures inside a stream and reports each attempt; an error it will not
/// retry, or a stream the Server completed, ends that stream alone. The Store
/// then restarts it with capped backoff, or follows its refusal class, and its
/// siblings never notice. A restarted stream reloads only the projections it
/// owns.
extension HausStore {
    func startEventStreams(serverID: String) {
        stopEventStreams()
        agentMessageRecovery.beginSession()
        realtimeServerID = serverID
        streamRestarts = RealtimeStreamRestarts()
        for stream in RealtimeStream.allCases {
            startStream(stream, serverID: serverID)
        }
    }

    func stopEventStreams() {
        flushLiveChatEventsBeforeTeardown()
        streamRestartTasks.values.forEach { $0.cancel() }
        streamRestartTasks = [:]
        recoveryFlush?.cancel()
        recoveryFlush = nil
        pendingRecovery = []
        realtimeServerID = nil
        eventTasks.cancelAll()
    }

    private func startStream(_ stream: RealtimeStream, serverID: String) {
        let task: Task<Void, Never> = switch stream {
        case .messageCreated:
            streamTask(stream, serverID: serverID) { (store, event: MessageCreatedEvent) in
                await store.receive(.messageCreated(event), serverID: serverID)
            }
        case .messageReactionUpdated:
            streamTask(stream, serverID: serverID) { (store, event: MessageReactionUpdatedEvent) in
                await store.receive(.reactionUpdated(event), serverID: serverID)
            }
        case .chatRead:
            streamTask(stream, serverID: serverID) { (store, event: ChatReadEvent) in
                await store.receive(.read(event), serverID: serverID)
            }
        case .threadFollowUpdated:
            streamTask(stream, serverID: serverID) { (store, event: ThreadFollowUpdatedEvent) in
                await store.receive(.threadFollowUpdated(event), serverID: serverID)
            }
        case .chatLifecycle:
            streamTask(stream, serverID: serverID) { (store, event: ChatLifecycleEvent) in
                await store.receive(.lifecycle(event), serverID: serverID)
            }
        case .cloudAgentWorkUpdated:
            streamTask(stream, serverID: serverID) { (store, event: CloudAgentWorkUpdatedEvent) in
                await store.receive(.cloudAgentWorkUpdated(event), serverID: serverID)
            }
        case .taskChanged:
            streamTask(stream, serverID: serverID) { (store, event: TaskChangedEvent) in
                await store.receive(.taskChanged(event), serverID: serverID)
            }
        case .taskLabelUpdated:
            streamTask(stream, serverID: serverID) { (store, event: TaskLabelUpdatedEvent) in
                await store.receive(.taskLabelUpdated(event), serverID: serverID)
            }
        case .agentLifecycle:
            streamTask(stream, serverID: serverID) { (store, event: AgentLifecycleEvent) in
                store.handle(lifecycleEvent: event)
            }
        case .agentActivity:
            streamTask(stream, serverID: serverID) { (store, event: AgentActivityEvent) in
                store.handle(activityEvent: event)
            }
        }
        eventTasks.replace(stream, with: task)
    }

    private func streamTask<Event: Decodable & Sendable>(
        _ stream: RealtimeStream,
        serverID: String,
        handle: @escaping @MainActor (HausStore, Event) async -> Void
    ) -> Task<Void, Never> {
        let events: AsyncThrowingStream<Event, Error> = client.subscribe(
            stream.path,
            input: ServerScopedInput(serverId: serverID),
            onConnected: { [weak self] in
                await self?.streamConnected(stream, serverID: serverID)
            },
            // Each failed transport attempt is reported here; the header's
            // grace period absorbs a quick reconnect.
            onDisconnected: { [weak self] in
                guard stream.reportsOutage, let self else { return }
                await self.markDisconnected()
            }
        )
        return Task { [weak self] in
            var failure: Error?
            do {
                for try await event in events {
                    guard !Task.isCancelled, let self else { return }
                    await handle(self, event)
                }
            } catch {
                failure = error
            }
            // A cancelled stream is a teardown we asked for, not an outage.
            guard !Task.isCancelled, let self else { return }
            let reason = failure?.localizedDescription ?? "completed by the Server"
            Self.logger.warning("\(stream.path, privacy: .public) stream ended: \(reason, privacy: .public)")
            streamEnded(stream, serverID: serverID, end: RealtimeStreamEnd(error: failure))
        }
    }

    /// A stream (re)connected. The first connect after a launch or a
    /// foreground refresh follows reads that are already fresh, so only a
    /// restart reloads the stream's owned projections. Volatile presence and
    /// activity re-read on every connect.
    private func streamConnected(_ stream: RealtimeStream, serverID: String) async {
        guard realtimeServerID == serverID, activeServer?.id == serverID else { return }
        if stream.reportsOutage { markConnected() }
        let isRestart = streamRestarts.connected(stream, at: Date())
        switch stream {
        case .agentLifecycle:
            await reloadAgentAvailability(serverID: serverID)
        case .agentActivity:
            await reloadActiveActivity(serverID: serverID)
        case .messageCreated where !isRestart:
            // A message committed between the launch reads and this subscribe
            // has no event; one tail read per loaded list closes that gap.
            tailLoadedTranscripts()
        default:
            if isRestart { requestRecovery(stream.ownedProjections, serverID: serverID) }
        }
    }

    private func streamEnded(_ stream: RealtimeStream, serverID: String, end: RealtimeStreamEnd) {
        guard realtimeServerID == serverID else { return }
        if stream.reportsOutage { markDisconnected() }
        switch streamRestarts.ended(stream, by: end, at: Date()) {
        case .stop:
            Self.logger.notice("\(stream.path, privacy: .public) stopped: role required")
        case .membershipLost:
            Task { await self.handleMembershipLost(serverID: serverID) }
        case let .restart(delay, reauthenticate):
            scheduleRestart(stream, serverID: serverID, after: delay, reauthenticate: reauthenticate)
        }
    }

    private func scheduleRestart(
        _ stream: RealtimeStream,
        serverID: String,
        after delay: Duration,
        reauthenticate: Bool
    ) {
        streamRestartTasks[stream]?.cancel()
        streamRestartTasks[stream] = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled, let self else { return }
            streamRestartTasks[stream] = nil
            guard case .loaded = state, activeServer?.id == serverID, realtimeServerID == serverID else { return }
            if reauthenticate {
                // The next connect reads whatever token Clerk now holds.
                do {
                    _ = try await clerk.auth.getToken(.init(skipCache: true))
                } catch {
                    Self.logger.warning("Session token refresh failed: \(error.localizedDescription, privacy: .public)")
                }
                guard !Task.isCancelled, realtimeServerID == serverID else { return }
            }
            startStream(stream, serverID: serverID)
        }
    }

    /// `membership_lost`: final for every stream of the Server. Closes the
    /// siblings, cancels in-flight reads (a cancelled read writes nothing),
    /// clears the Server's state, and reloads the Server list. Idempotent:
    /// several streams may end with the refusal.
    func handleMembershipLost(serverID: String) async {
        guard activeServer?.id == serverID, !membershipLossInFlight else { return }
        membershipLossInFlight = true
        defer { membershipLossInFlight = false }
        Self.logger.notice("Server membership lost; clearing its state")
        stopEventStreams()
        cancelTranscriptReads()
        resetInlineReplyCache()
        discardServerScopedState()
        servers.removeAll { $0.id == serverID }
        hasLiveServerState = false
        state = .loading
        await loadLiveServer(attempt: 0)
    }
}
