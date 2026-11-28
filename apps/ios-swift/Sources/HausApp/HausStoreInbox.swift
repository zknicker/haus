import Foundation
import HausModels
import OSLog

/// The Server-wide reads Home and the unread dots stand on: the Chat list,
/// unread Task chats, and the active Tasks.
///
/// Each snapshot lives on the Store rather than on a screen because the dots
/// outlive any one tab: a durable event refreshes what this client already
/// holds, and nothing here pulls in a read nobody has asked for. A failed
/// refresh keeps the previous snapshot and is logged — a stale row is honest,
/// while a Chat-level send alert for a background read is not.
extension HausStore {
    /// Every Server-wide Home read at once, for a surface that shows all of
    /// them. The reads are independent, so they run concurrently.
    func loadInbox() async {
        async let chats: Void = refreshInboxChats()
        async let unreadTasks: Void = loadUnreadTasks()
        async let activeTasks: Void = tasks.refreshActiveTasks()
        _ = await (chats, unreadTasks, activeTasks)
    }

    func markInboxRowRead(id: String) async {
        if isUnreadTaskChat(id) {
            await markTaskChatRead(chatID: id)
        } else {
            await markChatRead(chatID: id)
        }
    }

    /// Mark read on one Chat row: it leaves at once, the Server advances the
    /// read marker through the Chat's newest message with the same
    /// `chat.markRead` an open transcript sends, and a Chat-list refetch
    func markChatRead(chatID: String) async {
        guard let serverID = activeServer?.id,
              let chat = chats.first(where: { $0.id == chatID })
        else { return }
        let sequence = chat.lastMessageSequence
        markedReadThrough[chatID] = sequence
        defer { markedReadThrough[chatID] = nil }
        do {
            let _: ChatReadReceipt = try await client.mutation(
                "chat.markRead",
                input: ChatReadInput(chatID: chatID, sequence: sequence, serverID: serverID)
            )
            guard activeServer?.id == serverID else { return }
            try await reloadChats(serverID: serverID)
        } catch {
            Self.logger.error("Marking chat read failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// The Chats the Inbox lists as unread: the Chat list's, less any Mark
    /// read still settling. Nil until the Chat list has landed.
    var unreadChats: [ChatSummary]? {
        chatList.unreadChats
    }

    /// How many Unread rows there are, for surfaces that mark the Inbox
    var unreadChatCount: Int? {
        guard let unreadChats else { return nil }
        return unreadChats.count + visibleUnreadTasks.count
    }

    /// The Chat list is part of the shell's own snapshot and durable events
    /// keep it fresh; a pull on the Inbox asks for it again all the same.
    private func refreshInboxChats() async {
        guard let serverID = activeServer?.id else { return }
        do {
            try await reloadChats(serverID: serverID)
        } catch {
            Self.logger.error("Loading chats failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}
