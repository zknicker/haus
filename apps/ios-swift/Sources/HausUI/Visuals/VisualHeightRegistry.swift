import SwiftUI

/// The clamps a visual's height lives inside, shared with the web card
/// (`visualHeights` in `features/chats/visual-card.tsx`).
enum VisualHeights {
    /// Reserved until the frame reports, so a card never opens at zero.
    static let fallback: CGFloat = 240
    static let minimum: CGFloat = 120
    /// Resource guard for pathological documents, shared with the web.
    static let maximum: CGFloat = 100_000

    static func clamp(_ value: CGFloat) -> CGFloat {
        min(maximum, max(minimum, value.rounded()))
    }
}

/// A visual's identity on a screen: the message it was written in and its
/// ordinal within that message. Content only ever appends, so ordinals never
/// reorder and a card keeps its measurement across a streaming update.
struct VisualKey: Hashable {
    let messageID: String
    let ordinal: Int
}

/// Measured heights for the visuals on one screen, owned by
/// the screen rather than by the rows.
///
/// Transcript rows are hosted in `UIHostingConfiguration` cells inside the
/// flipped `UITableView` substrate (`TranscriptListView`), which re-hosts a row
/// only when SwiftUI state ABOVE the table changes — `reconfigureVisibleRows`
/// runs from `updateUIView`. A height reported from inside a cell therefore
/// never reaches the table, and the row keeps whatever height it first measured
/// at. Lifting the measurement into the screen's own state — the same shape as
/// `AttachmentImageTileRegistry` — is what lets a card grow: the screen's body
/// reads `revision`, so a report re-renders the screen, the table reconfigures
/// its visible rows, and the row lays out at the new frame.
@MainActor
@Observable
final class VisualHeightRegistry {
    /// Bumped once per main-actor turn in which a report was accepted. Screens
    /// read this in their body so the observation lands on the screen and not
    /// on the cell's hosting view.
    private(set) var revision = 0

    private var heights: [VisualKey: CGFloat] = [:]
    private var hasPendingBump = false

    init() {}

    func height(_ key: VisualKey) -> CGFloat? {
        heights[key]
    }

    /// Records a frame's report. Nonsense values are dropped rather than
    /// clamped into a plausible-looking height, and an unchanged height does
    /// not churn the table.
    ///
    /// The height is stored at once, but the revision that re-hosts every
    /// visible row is coalesced to one bump per turn: a single frame reports
    /// two or three times per load (`DOMContentLoaded`, the `ResizeObserver`,
    /// `load`), and a transcript of cards loading together would otherwise
    /// reconfigure the whole visible table once per report.
    func report(_ height: CGFloat, for key: VisualKey) {
        guard height.isFinite, height > 0 else { return }
        let clamped = VisualHeights.clamp(height)
        guard heights[key] != clamped else { return }
        heights[key] = clamped
        scheduleRevisionBump()
    }

    private func scheduleRevisionBump() {
        guard !hasPendingBump else { return }
        hasPendingBump = true
        Task { @MainActor [weak self] in
            guard let self else { return }
            hasPendingBump = false
            revision += 1
        }
    }
}
