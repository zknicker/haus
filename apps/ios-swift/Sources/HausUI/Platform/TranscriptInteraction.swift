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

/// One long-press menu action for a transcript row. The list owns the menu
/// presentation (see the coordinator's context-menu delegate methods) because
/// SwiftUI's `contextMenu` inside a flipped cell lifts an upside-down preview.
struct TranscriptMenuAction {
    let title: String
    let systemImage: String
    let handler: () -> Void
}
