import Foundation
import HausModels
import OSLog

/// Starting, stopping, and observing the Server's live streams.
///
/// The three subscriptions are one unit: each recovers its own snapshot on
/// connect, and a teardown cancels them together.
extension HausStore {
    func startEventStreams(serverID: String) {
        stopEventStreams()
        agentMessageRecovery.beginSession()
        if chatEventServerID != serverID {
            chatEventServerID = serverID
            chatEventReplay.reset()
        }

        let chatTask = Task { [weak self] in
            guard let self else { return }
            do {
                for try await event in await client.subscribe(
                    "chat.onEvent",
                    input: ServerScopedInput(serverId: serverID),
                    onConnected: { [weak self] in
                        guard let self else { return }
                        await self.catchUpChatEvents(serverID: serverID)
                    }
                ) as AsyncThrowingStream<ChatEvent, Error> {
                    guard !Task.isCancelled else { return }
                    await handle(chatEvent: event, serverID: serverID)
                }
            } catch {
                // A cancelled stream is a teardown we asked for, not an outage.
                guard !Task.isCancelled else { return }
                markDisconnected()
            }
        }
        let lifecycleTask = Task { [weak self] in
            guard let self else { return }
            do {
                for try await event in await client.subscribe(
                    "agent.onLifecycle",
                    input: ServerScopedInput(serverId: serverID),
                    onConnected: { [weak self] in
                        await self?.reloadAgentAvailability(serverID: serverID)
                    }
                ) as AsyncThrowingStream<AgentLifecycleEvent, Error> {
                    guard !Task.isCancelled else { return }
                    handle(lifecycleEvent: event)
                }
            } catch {
                guard !Task.isCancelled else { return }
                markDisconnected()
            }
        }
        let activityTask = Task { [weak self] in
            guard let self else { return }
            do {
                for try await event in await client.subscribe(
                    "agent.onActivity",
                    input: ServerScopedInput(serverId: serverID),
                    onConnected: { [weak self] in
                        await self?.reloadActiveActivity(serverID: serverID)
                    }
                ) as AsyncThrowingStream<AgentActivityEvent, Error> {
                    guard !Task.isCancelled else { return }
                    handle(activityEvent: event)
                }
            } catch {
                Self.logger.warning("Agent activity stream ended: \(error.localizedDescription, privacy: .public)")
            }
        }
        eventTasks.replace(with: [
            chatTask,
            lifecycleTask,
            activityTask,
        ])
    }

    func stopEventStreams() {
        flushLiveChatEventsBeforeTeardown()
        eventTasks.cancelAll()
    }
}
