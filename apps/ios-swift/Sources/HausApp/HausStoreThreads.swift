import Foundation
import HausModels
import OSLog

private let threadFollowLogger = Logger(
    subsystem: "chat.haus.ios",
    category: "thread-follow"
)

/// Thread attention: who is listening to a child conversation.
///
/// A Thread's follow state lives on the parent Chat page's `ThreadSummary`
/// (ADR 0013), so this file never keeps a second copy of it. The toggle patches
/// that page, Server's receipt settles it, and the durable
/// `thread.follow.updated` fan-out — which already refetches the parent page and
/// the Chat list in `HausStoreMessageLoading` — is what converges every other
/// surface, including the other clients.
extension HausStore {
    /// Whether the viewer follows this Thread, or `nil` when the parent page
    /// carries no such Thread yet.
    func threadFollowed(threadChatID: String, parentChatID: String) -> Bool? {
        ThreadFollowPatch.followed(
            threadChatID: threadChatID,
            in: messagesByChatID[parentChatID]
        )
    }

    func followThread(threadChatID: String, parentChatID: String) async {
        await setThreadFollow(true, threadChatID: threadChatID, parentChatID: parentChatID)
    }

    func unfollowThread(threadChatID: String, parentChatID: String) async {
        await setThreadFollow(false, threadChatID: threadChatID, parentChatID: parentChatID)
    }

    /// Toggles the Thread optimistically, then keeps whichever value Server
    /// answers with. A failed write rolls the summary back to what it said
    /// before the press, so the control never states attention Server did not
    /// record.
    func setThreadFollow(_ follow: Bool, threadChatID: String, parentChatID: String) async {
        guard let serverID = activeServer?.id else { return }
        let previous = threadFollowed(threadChatID: threadChatID, parentChatID: parentChatID)
        applyThreadFollow(follow, threadChatID: threadChatID, parentChatID: parentChatID)

        do {
            let receipt: ThreadFollowReceipt = try await client.mutation(
                "thread.setFollow",
                input: ThreadFollowInput(
                    follow: follow,
                    serverID: serverID,
                    threadChatID: threadChatID
                )
            )
            guard activeServer?.id == serverID else { return }
            applyThreadFollow(
                receipt.followed,
                threadChatID: threadChatID,
                parentChatID: parentChatID
            )
        } catch is CancellationError {
            // A popped screen cancels the write in flight; the durable event or
            // the next page load states what Server kept.
            return
        } catch {
            if let previous {
                applyThreadFollow(
                    previous,
                    threadChatID: threadChatID,
                    parentChatID: parentChatID
                )
            }
            threadFollowLogger.error(
                "Setting Thread follow failed: \(error.localizedDescription, privacy: .public)"
            )
        }
    }

    /// Writes a follow state into the parent page, if that page still carries
    /// the Thread and does not already say so.
    private func applyThreadFollow(_ followed: Bool, threadChatID: String, parentChatID: String) {
        guard let page = ThreadFollowPatch.page(
            messagesByChatID[parentChatID],
            followed: followed,
            threadChatID: threadChatID
        ) else { return }
        messagesByChatID[parentChatID] = page
    }
}
