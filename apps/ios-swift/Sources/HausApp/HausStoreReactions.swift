import Foundation
import HausModels
import HausUI
import OSLog

private let reactionLogger = Logger(subsystem: "chat.haus.ios", category: "reactions")

/// Message reactions: the viewer's `chat.react` writes and the projection of
/// Server reactions into sticker piles.
///
/// Reactions are durable Server state on each message row. What is app-local —
/// the viewer's unconfirmed adds and which stickers arrived live — lives on
/// `reactionStickers` and never touches a page.
extension HausStore {
    static func makeReactionStickerBoard(store: @escaping @MainActor () -> HausStore?) -> ReactionStickerBoard {
        ReactionStickerBoard { messageID, emoji, remove in
            guard let store = store() else { return }
            Task { await store.react(messageID: messageID, emoji: emoji, remove: remove) }
        }
    }

    /// Adds or removes the viewer's emoji. An add shows at once as a pending
    /// sticker; the receipt patches every page carrying the message, and the
    /// durable event converges the other lenses and clients.
    func react(messageID: String, emoji: String, remove: Bool) async {
        guard let serverID = activeServer?.id, let viewerUserID = members?.viewerUserID else { return }
        if remove {
            reactionStickers.dropPending(messageID: messageID, emoji: emoji)
        } else {
            reactionStickers.addPending(messageID: messageID, emoji: emoji, viewerUserID: viewerUserID)
        }

        do {
            let receipt: ChatMessageReactionReceipt = try await client.mutation(
                "chat.react",
                input: ChatMessageReactionInput(
                    emoji: emoji,
                    messageID: messageID,
                    remove: remove,
                    serverID: serverID
                )
            )
            guard activeServer?.id == serverID else { return }
            applyReactions(receipt.message.reactions, messageID: messageID)
        } catch {
            reactionStickers.dropPending(messageID: messageID, emoji: emoji)
            reactionLogger.error("Reacting failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Patches the message's reactions into every loaded page that shows it.
    private func applyReactions(_ reactions: [ChatMessageReaction], messageID: String) {
        for (chatID, page) in messagesByChatID {
            if let patched = page.replacingReactions(reactions, messageID: messageID) {
                messagesByChatID[chatID] = patched
            }
        }
        for (rootID, page) in inlineReplyPagesByRootID {
            if let patched = page.replacingReactions(reactions, messageID: messageID) {
                inlineReplyPagesByRootID[rootID] = patched
            }
        }
    }

    /// Resolves each reactor against the same directory message authors use,
    /// so a reactor reads the same here as on their own messages.
    func reactionPresentations(_ reactions: [ChatMessageReaction]) -> [MessageReactionPresentation] {
        let viewerUserID = members?.viewerUserID
        return reactions.map { reaction in
            MessageReactionPresentation(
                emoji: reaction.emoji,
                reactors: reaction.actors.map { reactorPresentation($0, viewerUserID: viewerUserID) }
            )
        }
    }

    private func reactorPresentation(
        _ actor: ChatMessageReactionActor,
        viewerUserID: String?
    ) -> ReactorPresentation {
        switch actor.kind {
        case .agent:
            let agent = agentsByID[actor.id]
            return ReactorPresentation(
                id: actor.id,
                name: agent?.displayName ?? actor.handle ?? "Agent",
                avatarURL: resolvedAvatarURL(agent?.avatarURL)
            )
        case .human:
            if actor.id == viewerUserID {
                return ReactorPresentation(id: actor.id, name: "You", isViewer: true)
            }
            let member = membersByID[actor.id]
            return ReactorPresentation(
                id: actor.id,
                name: member?.displayName ?? actor.handle ?? "Someone",
                avatarURL: resolvedAvatarURL(member?.avatarURL)
            )
        }
    }
}
