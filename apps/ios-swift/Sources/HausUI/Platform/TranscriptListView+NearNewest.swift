import SwiftUI
#if canImport(UIKit)
import UIKit

/// The programmatic settles that carry the viewport to the newest item, and the
/// publishing of whether it is showing that item.
///
/// The rule itself is `TranscriptNearNewest`; this is the geometry it reads, the
/// travel that carries each settle (`TranscriptListView+SettleTravel`), and the
/// two intents that open one — an append the policy wants animated, and a reveal
/// of the newest row.
extension TranscriptListCoordinator {
    /// `offsetBefore` is the offset the update found, before any inset it
    /// carries was applied.
    func settleAppend(
        table: UITableView,
        appended: Int,
        behavior: TranscriptAppendBehavior,
        offsetBefore: CGFloat,
        wasNearNewest: Bool
    ) {
        if behavior != .stay { heldAnchor = nil }
        let rest = CGPoint(x: 0, y: restingOffset(table))
        switch behavior {
        case .snapToNewest:
            endSettling()
            followedTopItemID = nil
            table.contentOffset = rest
        case .animateToNewest, .followNewest:
            // Nothing new to stage, and a travel already bound for the newest
            // row owns the viewport: let it finish rather than restart it.
            if appended == 0, nearNewest.isSettling { break }
            // In flipped space inserted rows appear in place; the ease-in is
            // staged by holding the viewport on the previous newest row and
            // releasing it toward rest, across everything that arrived. The
            // hold is where that row stood before this update: a send that
            // also collapses the composer moves rest in the same update, and
            // holding against the new rest dropped the transcript by the
            // collapse before the row eased in.
            let insertedHeight = (0..<appended).reduce(CGFloat.zero) { height, row in
                height + table.rectForRow(at: IndexPath(row: row, section: 0)).height
            }
            let held = wasNearNewest ? offsetBefore : rest.y
            setTravelOffset(held + insertedHeight, in: table)
            followedTopItemID = behavior == .followNewest ? items.last?.id : nil
            settleToNewest(table: table)
        case .stay:
            // `.stay` declines a new settle; it does not abandon one in
            // flight. That travel still owns the viewport and is still bound
            // for the newest item, so its own end signal closes it — dropping
            // the latch here would publish an offset it is passing through.
            guard !nearNewest.isSettling else { break }
            endSettling()
        }
    }

    func performReveal(
        view: TranscriptListView<Item, Row, Accessory>,
        table: UITableView
    ) {
        guard let reveal = view.reveal, reveal.token != handledRevealToken else { return }
        guard let index = items.lastIndex(where: { $0.id == reveal.id }) else { return }
        table.layoutIfNeeded()
        handledRevealToken = reveal.token
        followedTopItemID = nil
        heldAnchor = nil
        // The newest item's home is the resting edge, not the viewport center.
        guard index < items.count - 1 else {
            if reveal.animated {
                settleToNewest(table: table)
            } else {
                endSettling()
                table.contentOffset = CGPoint(x: 0, y: restingOffset(table))
            }
            return
        }
        endSettling()
        table.scrollToRow(
            at: IndexPath(row: items.count - 1 - index, section: 0),
            at: .middle,
            animated: reveal.animated
        )
    }

    /// The offset that puts the newest row's top just below the header
    /// clearance. Past rest only when that row is taller than the viewport.
    func newestTopOffset(_ table: UITableView) -> CGFloat {
        guard !items.isEmpty else { return restingOffset(table) }
        let newest = table.rectForRow(at: IndexPath(row: 0, section: 0))
        // Flipped: a row's maxY is its visual top, and the table's bottom
        // inset is the visual top clearance.
        return newest.maxY - table.bounds.height + table.contentInset.bottom
    }

    /// Keeps a followed reply's top in view while it grows past the viewport,
    /// the way a streamed answer reads from its beginning. A reply that still
    /// fits stays bottom-anchored; a drag, a reveal, or a newer item ends the
    /// hold.
    func holdFollowedTop(table: UITableView) {
        guard let followed = followedTopItemID else { return }
        guard items.last?.id == followed else {
            followedTopItemID = nil
            return
        }
        guard !nearNewest.isSettling, !table.isDragging, !table.isDecelerating else { return }
        let top = newestTopOffset(table)
        guard top > restingOffset(table), abs(table.contentOffset.y - top) > 0.5 else { return }
        table.contentOffset = CGPoint(x: 0, y: top)
    }

    /// Distance from the resting (newest) edge, in points. Zero at rest.
    func distanceFromNewest(_ scrollView: UIScrollView) -> CGFloat {
        scrollView.contentOffset.y + (appliedInsets?.top ?? scrollView.contentInset.top)
    }

    /// The offset that rests on the newest edge. Read from the inset the
    /// screen asked for, not the table's: a travel can hold the table's inset
    /// open past it for the few frames it takes to arrive.
    func restingOffset(_ table: UITableView) -> CGFloat {
        -(appliedInsets?.top ?? table.contentInset.top)
    }

    /// Where a settle comes to rest: the resting edge, or a followed reply's
    /// top once that reply is taller than the viewport. Read live, never
    /// captured, because the inset and the followed row both move under a
    /// travel.
    func settleHome(_ table: UITableView) -> CGFloat {
        let rest = restingOffset(table)
        return followedTopItemID == nil ? rest : max(rest, newestTopOffset(table))
    }

    /// Hands up the ids of the rows the viewport is showing, newest first.
    ///
    /// `indexPathsForVisibleRows` is the whole mechanism: the flipped table
    /// already knows exactly which cells intersect its bounds, which is the
    /// same question the web App asks an `IntersectionObserver`. Rows that
    /// intersect while sitting behind the header's or the composer's glass
    /// count, because glass is translucent and the reader can see them — the
    /// browser counts them too.
    ///
    /// It rides the near-newest sync rather than `scrollViewDidScroll` for the
    /// same reason that reading does: mid-turn geometry describes a viewport
    /// that is still landing, and a settle's destination is the honest answer.
    func publishVisibleItems(
        view: TranscriptListView<Item, Row, Accessory>,
        scrollView: UIScrollView
    ) {
        guard let onVisibleItems = view.onVisibleItems,
              let table = scrollView as? UITableView
        else { return }
        let visibleIDs = (table.indexPathsForVisibleRows ?? []).compactMap { indexPath -> String? in
            let index = items.count - 1 - indexPath.row
            guard items.indices.contains(index) else { return nil }
            return items[index].id
        }
        guard visibleIDs != publishedVisibleItemIDs else { return }
        publishedVisibleItemIDs = visibleIDs
        onVisibleItems(visibleIDs)
    }

    /// Publishes the near-newest answer once per runloop turn, from the geometry
    /// left standing at the end of it. Deferral is the point: insets, inserted
    /// rows, and settle offsets all land within the turn that triggered this,
    /// and only the reading after them describes where the transcript rests.
    func scheduleNearNewestSync(_ scrollView: UIScrollView) {
        guard !nearNewestSyncScheduled else { return }
        nearNewestSyncScheduled = true
        DispatchQueue.main.async { [weak self, weak scrollView] in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.nearNewestSyncScheduled = false
                guard let scrollView, let view = self.view else { return }
                self.publishVisibleItems(view: view, scrollView: scrollView)
                let published = self.nearNewest.settle(
                    distance: self.distanceFromNewest(scrollView)
                )
                guard let published else { return }
                view.isNearNewest = published
            }
        }
    }
}

#endif
