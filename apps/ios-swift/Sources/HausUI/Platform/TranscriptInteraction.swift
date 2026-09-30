import Foundation

enum TranscriptAppendBehavior: Equatable {
    /// Show the newest item immediately — a send the reader just made.
    case snapToNewest
    /// Ease the newest item in — a delivery while the reader is at the tail.
    case animateToNewest
    /// Leave the viewport where it is — the reader has scrolled away.
    case stay
}

/// A one-shot request to bring an item into view, keyed by token so the same
/// item can be revealed twice.
struct TranscriptReveal: Equatable {
    let token: UUID
    let id: String
    let animated: Bool
}

/// One long-press menu entry for a transcript row. The list owns the menu
/// presentation (see the coordinator's context-menu delegate methods) because
/// SwiftUI's `contextMenu` inside a flipped cell lifts an upside-down preview.
enum TranscriptMenuAction {
    case action(title: String, systemImage: String, handler: () -> Void)
    /// The quick-react row and who reacted (`TranscriptMenuElements.swift`).
    case reactions(TranscriptReactionMenu)

    init(title: String, systemImage: String, handler: @escaping () -> Void) {
        self = .action(title: title, systemImage: systemImage, handler: handler)
    }
}

/// A message's reaction section in its long-press menu: the App's quick
/// reactions as one compact row, then who stuck each sticker.
struct TranscriptReactionMenu {
    /// The App's hover-bar set, in its order.
    static let quickEmoji = ["👍", "❤️", "😂", "💯"]

    /// Emoji the viewer already reacted with; choosing one takes it back.
    let ownEmoji: Set<String>
    /// Every sticker in pile order, the "+N" overflow included.
    let entries: [ReactionSticker]
    let onToggle: (_ emoji: String, _ remove: Bool) -> Void
}
