import Foundation
import HausModels
import HausTransport
import OSLog

/// Starting, stopping, observing, and recovering the Server's live streams.
///
/// The three subscriptions are one unit: each recovers its own snapshot on
/// connect, and a teardown cancels them together. The transport reconnects
/// transport failures on its own and reports each failed attempt and each
/// reconnect, which is what `isConnected` follows; an error it will not retry (an auth or
/// procedure error) or a stream the Server ended reaches `streamEnded`, which
/// restarts the unit with capped backoff behind a fresh session token. The
/// chat stream's connect callback is the catch-up after that restart.
extension HausStore {
    /// A unit that stayed up this long earned a fresh backoff.
    static let streamStableInterval: TimeInterval = 30

    func startEventStreams(serverID: String) {
        stopEventStreams()
        agentMessageRecovery.beginSession()
        if chatEventServerID != serverID {
            chatEventServerID = serverID
            chatEventReplay.reset()
        }
        streamsStartedAt = Date()
        streamsHealthy = true

        let chatTask = streamTask("chat.onEvent", serverID: serverID, reportsOutage: true) { store in
            await store.catchUpChatEvents(serverID: serverID)
        } handle: { (store, event: ChatEvent) in
            await store.handle(chatEvent: event, serverID: serverID)
        }
        let lifecycleTask = streamTask("agent.onLifecycle", serverID: serverID, reportsOutage: true) { store in
            await store.reloadAgentAvailability(serverID: serverID)
        } handle: { (store, event: AgentLifecycleEvent) in
            store.handle(lifecycleEvent: event)
        }
        // Semantic activity is decoration on top of lifecycle presence, so its
        // loss restarts the unit without reporting the Server unreachable.
        let activityTask = streamTask("agent.onActivity", serverID: serverID, reportsOutage: false) { store in
            await store.reloadActiveActivity(serverID: serverID)
        } handle: { (store, event: AgentActivityEvent) in
            store.handle(activityEvent: event)
        }
        eventTasks.replace(with: [chatTask, lifecycleTask, activityTask])
    }

    func stopEventStreams() {
        flushLiveChatEventsBeforeTeardown()
        streamRestart?.cancel()
        streamRestart = nil
        streamsHealthy = false
        eventTasks.cancelAll()
    }

    private func streamTask<Event: Decodable & Sendable>(
        _ path: String,
        serverID: String,
        reportsOutage: Bool,
        onConnected: @escaping @MainActor (HausStore) async -> Void,
        handle: @escaping @MainActor (HausStore, Event) async -> Void
    ) -> Task<Void, Never> {
        let stream: AsyncThrowingStream<Event, Error> = client.subscribe(
            path,
            input: ServerScopedInput(serverId: serverID),
            onConnected: { [weak self] in
                guard let self else { return }
                if reportsOutage { await self.markConnected() }
                await onConnected(self)
            },
            // The transport retries transport failures inside the stream, so
            // an outage never ends it; each failed attempt is reported here,
            // and the header's grace period absorbs a quick reconnect.
            onDisconnected: { [weak self] in
                guard reportsOutage, let self else { return }
                await self.markDisconnected()
            }
        )
        return Task { [weak self] in
            var failure: Error?
            do {
                for try await event in stream {
                    guard !Task.isCancelled, let self else { return }
                    await handle(self, event)
                }
            } catch {
                failure = error
            }
            // A cancelled stream is a teardown we asked for, not an outage.
            guard !Task.isCancelled, let self else { return }
            let reason = failure?.localizedDescription ?? "ended by the Server"
            Self.logger.warning("\(path, privacy: .public) stream stopped: \(reason, privacy: .public)")
            streamEnded(serverID: serverID, reportsOutage: reportsOutage)
        }
    }

    private func streamEnded(serverID: String, reportsOutage: Bool) {
        if reportsOutage { markDisconnected() }
        streamsHealthy = false
        guard streamRestart == nil else { return }
        if let startedAt = streamsStartedAt,
           Date().timeIntervalSince(startedAt) >= Self.streamStableInterval {
            streamRestartAttempt = 0
        }
        let delay = RetryBackoff.delay(attempt: streamRestartAttempt)
        streamRestartAttempt += 1
        streamRestart = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled, let self else { return }
            // Cleared before restarting, because starting stops any restart.
            streamRestart = nil
            guard case .loaded = state, activeServer?.id == serverID else { return }
            // A rejected stream is most often an expired session; the next
            // connect reads whatever token Clerk now holds.
            do {
                _ = try await clerk.auth.getToken(.init(skipCache: true))
            } catch {
                Self.logger.warning("Session token refresh failed: \(error.localizedDescription, privacy: .public)")
            }
            guard !Task.isCancelled, activeServer?.id == serverID else { return }
            startEventStreams(serverID: serverID)
        }
    }
}
