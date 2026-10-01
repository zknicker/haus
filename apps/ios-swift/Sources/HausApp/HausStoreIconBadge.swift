import Foundation
import HausModels
import OSLog

/// The app icon badge is the Server's number, not this client's: push sets
/// `aps.badge` to the reader's unread Chats across every Server, so the app
/// reads that same count (`chat.unreadChatCount`) rather than counting only
/// the active Server's Chat list. The sidebar's Inbox dot stays per Server.
///
/// It refreshes wherever the Chat list does — a Server load, a snapshot
/// refresh on foreground or reconnect, and every `reloadChats` that events,
/// reads, and Mark read drive — so the badge moves with the list.
extension HausStore {
    /// Reads the cross-Server unread-Chat count. A failed read keeps the
    /// previous badge and is logged; a stale badge is honest, a cleared one
    /// is not.
    func refreshIconBadge() async {
        do {
            let unread: UnreadChatCount = try await client.query("chat.unreadChatCount")
            if iconBadgeCount != unread.count { iconBadgeCount = unread.count }
        } catch {
            Self.logger.error("Loading the unread chat count failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}
