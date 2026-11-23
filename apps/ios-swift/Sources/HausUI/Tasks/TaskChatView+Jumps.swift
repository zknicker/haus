import SwiftUI

/// The Task chat's explicit jumps, as every chat has them: up to the first
/// unread message, and down to the latest, at the trailing edge.
extension TaskChatView {
    var jumps: TranscriptJumps {
        TranscriptJumps(isNearNewest: isNearNewest, hasNewer: history.hasNewer, unread: unreadJump)
    }

    var jumpStack: some View {
        let jumps = jumps
        return VStack(spacing: 10) {
            if jumps.showsUnread, let id = unreadJump.messageID {
                TranscriptJumpButton(label: "Jump to first unread message", direction: .up) {
                    unreadJump = unreadJump.spent()
                    revealMessage(id)
                }
                .transition(.scale(scale: 0.6).combined(with: .opacity))
            }
            if jumps.showsLatest {
                TranscriptJumpButton(label: "Scroll to latest message") {
                    Task {
                        let id = history.hasNewer ? await history.loadLatest() : projection.messageIDs.last
                        if let id {
                            reveal = TranscriptReveal(token: UUID(), id: id, animated: !history.hasNewer)
                        }
                    }
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .padding(.trailing, 16)
        .padding(.bottom, 10)
        .safeAreaPadding(.bottom)
    }

    /// Reveals a message and lights it; one outside the loaded page is read
    /// in around it first.
    private func revealMessage(_ id: String) {
        Task {
            let isLoaded = projection.messageIDs.contains(id)
            if !isLoaded {
                guard await history.loadAround(id) else { return }
            }
            reveal = TranscriptReveal(token: UUID(), id: id, animated: isLoaded)
            highlightedMessageID = id
        }
    }
}
