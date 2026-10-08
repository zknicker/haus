import Foundation
import OSLog

/// Coalesced `chat.list` refreshes for the event paths.
///
/// One new message used to read the Chat list twice: once for the
/// `message.created` batch, and again for the `chat.read` echo of the read
/// that batch acknowledged. Neither event carries the unread count or ordering
/// Server computes, so the read itself stays; requests that land inside the
/// short gather window, or while a read is in flight, share it instead.
extension HausStore {
    /// Long enough to absorb the read echo that follows an acknowledgement,
    /// short enough that unread and ordering still land as one arrival.
    static let chatListRefreshWindow = Duration.milliseconds(150)

    /// Returns once a `chat.list` read that started after this call has
    /// applied, or has failed.
    func refreshChatList(serverID: String) async {
        if let running = chatListRefresh {
            chatListRefreshAgain = true
            await running.value
            return
        }
        let task = Task { [weak self] in
            guard let self else { return }
            repeat {
                try? await Task.sleep(for: Self.chatListRefreshWindow)
                // Cleared after the window, so a request made during it is
                // served by this read rather than queueing another.
                chatListRefreshAgain = false
                guard !Task.isCancelled, activeServer?.id == serverID else { break }
                do {
                    try await reloadChats(serverID: serverID)
                } catch is CancellationError {
                    break
                } catch {
                    Self.logger.warning("Chat list refresh failed: \(error.localizedDescription, privacy: .public)")
                }
            } while chatListRefreshAgain
            chatListRefresh = nil
        }
        chatListRefresh = task
        await task.value
    }
}
