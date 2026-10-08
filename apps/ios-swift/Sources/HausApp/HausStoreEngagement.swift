import Foundation
import HausModels
import HausTransport
import HausUI

/// The header engagement row's live connection for one open Chat (ADR 0035, 0036).
///
/// Engagement and thoughts are Chat-scoped streams, unlike the Server-wide
/// streams in `HausStoreEventStreams.swift`, so they live exactly as long as
/// the header row that shows them: `HeaderEngagement` runs `connectChatTyping` in its own
/// task, and leaving the Chat cancels both subscriptions.
extension HausStore {
    var chatEngagementSource: ChatEngagementSource {
        ChatEngagementSource(
            connect: { [weak self] chatID, model in
                await self?.connectChatTyping(chatID: chatID, model: model)
            },
            typist: { [weak self] agentID in
                guard let self, let agent = agentsByID[agentID] else { return nil }
                return ChatTypist(
                    id: agent.id,
                    name: agent.displayName,
                    avatarURL: resolvedAvatarURL(agent.avatarURL)
                )
            }
        )
    }

    func connectChatTyping(chatID: String, model: ChatTypingModel) async {
        guard let serverID = activeServer?.id else { return }
        model.transcript = { [weak self] in self?.messagesByChatID[chatID]?.messages ?? [] }
        let input = ChatEngagementInput(chatId: chatID, serverId: serverID)
        async let engagements: Void = restartingChatStream("chat.onEngagement", input: input) { store in
            try await store.streamChatEngagements(input: input, into: model)
        }
        async let thoughts: Void = restartingChatStream("chat.onThought", input: input) { store in
            try await store.streamChatThoughts(input: input, into: model)
        }
        _ = await (engagements, thoughts)
    }

    /// The transport reconnects transport failures itself; a stream it will
    /// not retry, or one the Server ended, restarts here with the same capped
    /// backoff as the Server-wide streams, for as long as the row's Chat is open.
    private func restartingChatStream(
        _ path: String,
        input: ChatEngagementInput,
        run: @MainActor (HausStore) async throws -> Void
    ) async {
        var attempt = 0
        while !Task.isCancelled, activeServer?.id == input.serverId {
            let startedAt = Date()
            do {
                try await run(self)
            } catch {
                guard !Task.isCancelled else { return }
                Self.logger.warning("\(path, privacy: .public) stream stopped: \(error.localizedDescription, privacy: .public)")
            }
            if Date().timeIntervalSince(startedAt) >= Self.streamStableInterval { attempt = 0 }
            try? await Task.sleep(for: RetryBackoff.delay(attempt: attempt))
            attempt += 1
        }
    }

    private func streamChatEngagements(input: ChatEngagementInput, into model: ChatTypingModel) async throws {
        let frames: AsyncThrowingStream<ChatEngagementFrame, Error> = client.subscribe(
            "chat.onEngagement",
            input: input,
            // The stream never replays, so every (re)connect re-reads the durable state.
            onConnected: { [weak self] in
                await self?.reloadChatEngagements(input: input, into: model)
            }
        )
        for try await frame in frames {
            guard let event = frame.event,
                  event.serverID == input.serverId, event.chatID == input.chatId else { continue }
            model.apply(event)
        }
    }

    /// Thoughts are never recovered: one missed while disconnected is simply gone.
    private func streamChatThoughts(input: ChatEngagementInput, into model: ChatTypingModel) async throws {
        let thoughts: AsyncThrowingStream<AgentThoughtEvent, Error> = client.subscribe(
            "chat.onThought",
            input: input
        )
        for try await thought in thoughts
        where thought.serverID == input.serverId && thought.chatID == input.chatId {
            model.receive(thought)
        }
    }

    private func reloadChatEngagements(input: ChatEngagementInput, into model: ChatTypingModel) async {
        do {
            let read: ChatEngagements = try await client.query("chat.engagements", input: input)
            guard activeServer?.id == input.serverId else { return }
            model.replace(read.engagements)
        } catch is CancellationError {
            return
        } catch {
            Self.logger.warning("Chat engagement read failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}

struct ChatEngagementInput: Encodable, Sendable {
    let chatId: String
    let serverId: String
}
