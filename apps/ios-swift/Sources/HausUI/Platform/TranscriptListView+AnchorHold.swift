#if canImport(UIKit)
import UIKit

/// Keeps a reader who scrolled away from the newest item looking at the same
/// rows after the update that anchored them.
///
/// An update restores its anchor against the heights UIKit knows then, and a
/// row that just arrived only has an estimate. When that row is laid out — a
/// long reply landing below a reader who scrolled up, its cell sizing itself a
/// moment later — every row after it moves, and nothing re-anchors them. So
/// the last anchor is held, and each content-size change re-applies it until
/// the reader or the next update takes the viewport. A followed reply's top is
/// held the same way.
extension TranscriptListCoordinator {
    func observeContentSize(of table: UITableView) {
        contentSizeObservation = table.observe(\.contentSize, options: [.old, .new]) {
            [weak self] table, change in
            guard change.oldValue != change.newValue else { return }
            MainActor.assumeIsolated {
                self?.reapplyHeldAnchor(table)
            }
        }
    }

    private func reapplyHeldAnchor(_ table: UITableView) {
        guard !isReapplyingAnchor else { return }
        // A followed reply sizing itself late keeps its top in view the same
        // way.
        if followedTopItemID != nil {
            isReapplyingAnchor = true
            holdFollowedTop(table: table)
            isReapplyingAnchor = false
            return
        }
        guard let held = heldAnchor else { return }
        // Anything that moved the viewport since — a scroll, a reveal — has
        // taken it, and the hold is over.
        guard abs(table.contentOffset.y - held.offset) < 0.5,
              !table.isDragging,
              !table.isDecelerating,
              !nearNewest.isSettling
        else {
            heldAnchor = nil
            return
        }
        hold(held.anchor, in: table)
    }

    /// Restores an anchor and keeps holding it at the offset it lands on.
    func hold(_ anchor: TranscriptScrollAnchor, in table: UITableView) {
        isReapplyingAnchor = true
        anchor.restore(in: table, items: items)
        isReapplyingAnchor = false
        heldAnchor = (anchor, table.contentOffset.y)
    }
}

#endif
