import Foundation
import HausModels
import HausTransport
import HausUI

/// The typing strip's live connection for one open Chat (ADR 0035, 0036).
///
/// Engagement and thoughts are Chat-scoped streams, unlike the Server-wide
/// streams in `HausStoreEventStreams.swift`, so they live exactly as long as
/// the strip that shows them: the strip runs `connectChatTyping` in its own
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
        async let engagements: Void = streamChatEngagements(input: input, into: model)
        async let thoughts: Void = streamChatThoughts(input: input, into: model)
        _ = await (engagements, thoughts)
    }

    private func streamChatEngagements(input: ChatEngagementInput, into model: ChatTypingModel) async {
        do {
            let events: AsyncThrowingStream<ChatEngagementEvent, Error> = await client.subscribe(
                "chat.onEngagement",
                input: input,
                // The stream never replays, so every (re)connect re-reads the durable state.
                onConnected: { [weak self] in
                    await self?.reloadChatEngagements(input: input, into: model)
                }
            )
            for try await event in events
            where event.serverID == input.serverId && event.chatID == input.chatId {
                model.apply(event)
            }
        } catch {
            guard !Task.isCancelled else { return }
            Self.logger.warning("Chat engagement stream ended: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Thoughts are never recovered: one missed while disconnected is simply gone.
    private func streamChatThoughts(input: ChatEngagementInput, into model: ChatTypingModel) async {
        do {
            let thoughts: AsyncThrowingStream<AgentThoughtEvent, Error> = await client.subscribe(
                "chat.onThought",
                input: input
            )
            for try await thought in thoughts
            where thought.serverID == input.serverId && thought.chatID == input.chatId {
                model.receive(thought)
            }
        } catch {
            guard !Task.isCancelled else { return }
            Self.logger.warning("Chat thought stream ended: \(error.localizedDescription, privacy: .public)")
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
