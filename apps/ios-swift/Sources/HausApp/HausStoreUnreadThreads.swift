import Foundation
import HausModels
import OSLog

/// Unread Threads as their own Inbox rows (ADR 0043). A Thread's replies never
/// count on its parent Chat, so `thread.listUnread` is read beside every Chat
/// list read (`reloadChats`), and on its own when only a Thread's read moved.
/// A failed read keeps the previous rows and is logged, like the Chat list.
extension HausStore {
    func loadUnreadThreads() async {
        guard let serverID = activeServer?.id else { return }
        unreadThreadsReadToken += 1
        let token = unreadThreadsReadToken
        do {
            let list: UnreadThreadList = try await client.query(
                "thread.listUnread",
                input: ServerScopedInput(serverId: serverID)
            )
            guard activeServer?.id == serverID, token == unreadThreadsReadToken else { return }
            if unreadThreads != list.threads { unreadThreads = list.threads }
        } catch is CancellationError {
            return
        } catch {
            Self.logger.error("Loading unread threads failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// A Thread read moved: its row and the cross-Server badge both count it.
    func refreshUnreadThreadsAndBadge() async {
        async let threads: Void = loadUnreadThreads()
        async let badge: Void = refreshIconBadge()
        _ = await (threads, badge)
    }

    /// The unread Threads the Inbox lists: those whose parent the Chat list
    /// holds, less any Mark read still settling. Empty until the first read,
    /// so the Chat rows never wait on it.
    var visibleUnreadThreads: [UnreadThread] {
        guard let unreadThreads else { return [] }
        return UnreadThreads.visible(
            unreadThreads,
            parentChatIDs: Set(chats.map(\.id)),
            markedReadThrough: markedReadThrough
        )
    }

    /// Where a Thread opens: its first unread reply, while the Thread is
    /// unread. Read once by the Thread screen, so reading never moves it.
    func unreadThreadLanding(threadChatID: String?) -> String? {
        guard let threadChatID else { return nil }
        return unreadThreads?.first { $0.threadChatID == threadChatID }?.firstUnreadMessageID
    }

    /// The Thread an Inbox row opens, projected from its anchor.
    func inboxThreadSelection(threadChatID: String) async -> ThreadSelection? {
        guard let thread = unreadThreads?.first(where: { $0.threadChatID == threadChatID }) else {
            return nil
        }
        return await threadSelection(
            conversationChatID: thread.parentChatID,
            threadChatID: thread.threadChatID,
            anchorMessageID: thread.anchorMessageID
        )
    }

    /// Mark read on a Thread row: it leaves at once, the Server reads the
    /// Thread's own Chat through its newest reply, and a re-read reconciles
    /// before the row is allowed back. A failure puts the row back.
    func markThreadRead(threadChatID: String) async {
        guard let serverID = activeServer?.id,
              let thread = unreadThreads?.first(where: { $0.threadChatID == threadChatID })
        else { return }
        markedReadThrough[threadChatID] = thread.lastMessageSequence
        defer { markedReadThrough[threadChatID] = nil }
        do {
            let _: ChatReadReceipt = try await client.mutation(
                "chat.markRead",
                input: ChatReadInput(
                    chatID: threadChatID,
                    sequence: thread.lastMessageSequence,
                    serverID: serverID
                )
            )
            guard activeServer?.id == serverID else { return }
            await refreshUnreadThreadsAndBadge()
        } catch {
            Self.logger.error("Marking thread read failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}
