import Foundation
import HausModels
import OSLog

private let threadFollowLogger = Logger(
    subsystem: "chat.haus.ios",
    category: "thread-follow"
)

/// Thread attention: who is listening to a child conversation.
///
/// A Thread's follow state lives on its anchor message's entity, the
/// `ThreadSummary` the parent Chat page carries (ADR 0013). A press shows at
/// once through an app-local overlay; the entity is only ever written by a
/// read, so the receipt reads the anchor again and the overlay retires. The
/// `thread.onFollowUpdated` notification converges every other surface.
extension HausStore {
    /// Whether the viewer follows this Thread, or `nil` when the parent page
    /// carries no such Thread yet.
    func threadFollowed(threadChatID: String, parentChatID: String) -> Bool? {
        let settled = ThreadFollowState.followed(
            threadChatID: threadChatID,
            in: messagesByChatID[parentChatID]
        )
        guard settled != nil else { return nil }
        return threadFollowOverlay[threadChatID] ?? settled
    }

    func followThread(threadChatID: String, parentChatID: String) async {
        await setThreadFollow(true, threadChatID: threadChatID, parentChatID: parentChatID)
    }

    func unfollowThread(threadChatID: String, parentChatID: String) async {
        await setThreadFollow(false, threadChatID: threadChatID, parentChatID: parentChatID)
    }

    /// Shows the press at once, then settles on what Server answers. A failed
    /// write drops the overlay, so the control never states attention Server
    /// did not record.
    func setThreadFollow(_ follow: Bool, threadChatID: String, parentChatID: String) async {
        guard let serverID = activeServer?.id else { return }
        threadFollowOverlay[threadChatID] = follow
        defer {
            if threadFollowOverlay[threadChatID] == follow {
                threadFollowOverlay.removeValue(forKey: threadChatID)
            }
        }

        do {
            let receipt: ThreadFollowReceipt = try await client.mutation(
                "thread.setFollow",
                input: ThreadFollowInput(
                    follow: follow,
                    serverID: serverID,
                    threadChatID: threadChatID
                )
            )
            guard activeServer?.id == serverID,
                  let anchorID = messagesByChatID[parentChatID]?.threads
                      .first(where: { $0.threadChatID == threadChatID })?.anchorMessageID
            else { return }
            threadFollowOverlay[threadChatID] = receipt.followed
            await readThreadAnchor(EntityRefresh(chatID: parentChatID, messageID: anchorID))
            if threadFollowOverlay[threadChatID] == receipt.followed {
                threadFollowOverlay.removeValue(forKey: threadChatID)
            }
        } catch is CancellationError {
            // A popped screen cancels the write in flight; the realtime event
            // or the next page load states what Server kept.
            return
        } catch {
            threadFollowLogger.error(
                "Setting Thread follow failed: \(error.localizedDescription, privacy: .public)"
            )
        }
    }

    /// Reads the anchor entity and waits for it, so the overlay retires onto
    /// the Server's summary rather than flickering back first.
    private func readThreadAnchor(_ refresh: EntityRefresh) async {
        refreshEntity(refresh)
        await entityLoads[refresh.messageID]?.task.value
    }
}
