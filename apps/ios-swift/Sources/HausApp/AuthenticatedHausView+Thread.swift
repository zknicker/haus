import HausModels
import HausUI
import SwiftUI

/// The pushed Thread route: the screen a Thread opens on, the state it reads
/// from the Store, and the two things it can ask for beyond a reply — opening
/// an Agent, and following the Thread.
extension AuthenticatedHausView {
    /// A Thread is a pushed screen above the canvas, so opening an Agent from a
    /// reply pops back to the canvas the shell's own Agent route lands on.
    @MainActor
    func openAgentFromThread(_ agentID: String) {
        guard let destination = store.chatDestinations.agentDestination(agentID: agentID) else {
            return
        }
        openCanvasChat(destination.id)
    }

    /// The pushed Thread screen. It owns the open Chat while it is on screen,
    /// which is why the canvas selection sync stands down for it.
    @ViewBuilder
    func threadDestination(_ thread: ThreadSelection) -> some View {
        ThreadDetailView(
            anchor: store.messagePresentations(chatID: thread.parentChatID)
                .first(where: { $0.id == thread.anchor.id }) ?? thread.anchor,
            replies: {
                let chatID = resolvedThreadChatID(for: thread)
                    ?? store.pendingThreadChatID(anchorMessageID: thread.anchor.id)
                return store.messagePresentations(chatID: chatID)
            },
            isConnected: store.isConnected,
            onSend: { content, attachments in
                guard let resolvedThreadChatID = await store.sendThreadReply(
                    content,
                    to: thread.parentChatID,
                    anchorMessageID: thread.anchor.id,
                    pendingChatID: thread.threadChatID
                        ?? store.pendingThreadChatID(anchorMessageID: thread.anchor.id),
                    attachments: attachments
                ) else { return false }

                // Server is authoritative for the child Chat id. Usually this
                // equals the route value; retaining the update makes a
                // stale/prospective route converge without deriving an id
                // on-device.
                if resolvedThreadChatID != thread.threadChatID {
                    selectedThread?.threadChatID = resolvedThreadChatID
                }
                // A prospective route had no child Chat to open on arrival.
                // Promote it to the canonical child now so subsequent sends and
                // read acknowledgements use the same Server Chat as the
                // transcript.
                if selectedThread?.id == thread.id {
                    await store.openChat(chatID: resolvedThreadChatID)
                }
                return true
            },
            onOpenAttachment: { attachment in
                try await store.downloadAttachment(attachment)
            },
            hasOlderReplies: resolvedThreadChatID(for: thread).map(store.hasOlderMessages) ?? false,
            isLoadingOlderReplies: resolvedThreadChatID(for: thread).map(store.isLoadingOlderMessages) ?? false,
            onLoadOlderReplies: {
                guard let chatID = resolvedThreadChatID(for: thread) else { return false }
                return await store.loadOlderMessages(chatID: chatID)
            },
            onOpenAgent: openAgentFromThread,
            onCancelCloudAgent: store.canManageServer ? { workID in
                try await store.cancelCloudAgent(workID: workID)
            } : nil,
            follow: threadFollow(for: thread),
            onVisibleMessagesChange: { reportVisibleReplies($0, in: thread) }
        )
        .task {
            guard let chatID = resolvedThreadChatID(for: thread) else { return }
            await store.openChat(chatID: chatID)
        }
    }

    func resolvedThreadChatID(for thread: ThreadSelection) -> String? {
        thread.resolvedChatID(selectedThread: selectedThread, store: store)
    }

    /// The Thread's follow state, read from the parent page's summary. A Thread
    /// Server has not created yet has no summary, so its screen shows no
    /// control until the first reply lands.
    func threadFollow(for thread: ThreadSelection) -> ThreadFollow? {
        guard let threadChatID = resolvedThreadChatID(for: thread),
              let followed = store.threadFollowed(
                  threadChatID: threadChatID,
                  parentChatID: thread.parentChatID
              )
        else { return nil }

        return ThreadFollow(followed: followed) { follow in
            await store.setThreadFollow(
                follow,
                threadChatID: threadChatID,
                parentChatID: thread.parentChatID
            )
        }
    }
}
