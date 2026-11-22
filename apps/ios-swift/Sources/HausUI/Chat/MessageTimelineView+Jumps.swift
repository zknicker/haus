import SwiftUI

/// The explicit jumps: up to the first unread message, and down to the latest.
/// They sit at the trailing edge so the place's Work pill keeps the center.
extension MessageTimelineView {
    var jumps: TranscriptJumps {
        TranscriptJumps(isNearNewest: isNearNewest, hasNewer: history.hasNewer, unread: unreadJump)
    }

    var jumpStack: some View {
        let jumps = jumps
        return VStack(spacing: 10) {
            if jumps.showsUnread, let id = unreadJump.messageID {
                TranscriptJumpButton(label: "Jump to first unread message", direction: .up) {
                    unreadJump = unreadJump.spent()
                    requestHistoryReveal(.message(id))
                }
                .transition(.scale(scale: 0.6).combined(with: .opacity))
            }
            if jumps.showsLatest {
                TranscriptJumpButton(label: "Scroll to latest message") {
                    requestHistoryReveal(.latest)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .padding(.trailing, 16)
        .padding(.bottom, 10)
        .safeAreaPadding(.bottom)
    }
}
