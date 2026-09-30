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

