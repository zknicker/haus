import Foundation
import HausModels
import OSLog

private let catchUpLogger = Logger(subsystem: "chat.haus.ios", category: "chat-realtime")

/// The durable Chat event log walk that closes every stream (re)connect gap.
extension HausStore {
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
            catchUpLogger.error(
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
