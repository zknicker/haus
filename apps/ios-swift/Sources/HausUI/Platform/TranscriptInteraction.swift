import Foundation

enum TranscriptAppendBehavior: Equatable {
    /// Show the newest item immediately — a send the reader just made.
    case snapToNewest
    /// Ease the newest item in — the reader's own send.
    case animateToNewest
    /// Ease the newest item in, but when it is taller than the viewport bring
    /// its top into view and hold it there as it grows — someone else's reply
    /// while the reader is at the tail, read from its beginning.
    case followNewest
    /// Leave the viewport where it is — the reader has scrolled away.
    case stay
}

/// A one-shot request to bring an item into view, keyed by token so the same
/// item can be revealed twice.
struct TranscriptReveal: Equatable {
    let token: UUID
    let id: String
    let animated: Bool
    var placement: TranscriptRevealPlacement = .center
}

enum TranscriptRevealPlacement: Equatable {
    /// Centers the item, or rests on the newest edge for the newest item.
    case center
    /// Opening a Thread at its first unread reply (ADR 0043): stays put when
    /// the item's top already reads from the opening position, otherwise
    /// brings its top just under the top clearance with the item before it
    /// peeking.
    case landing
}

