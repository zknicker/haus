import SwiftUI
#if canImport(UIKit)
import UIKit

/// The programmatic settles that carry the viewport to the newest item, and the
/// publishing of whether it is showing that item.
///
/// The rule itself is `TranscriptNearNewest`; this is the geometry it reads, the
/// signals that close each settle, and the two intents that open one — an append
/// the policy wants animated, and a reveal of the newest row.
/// How long a settle waits for `scrollViewDidEndScrollingAnimation` before
/// closing itself. A little past UIKit's own scroll-animation duration, so the
/// fallback only fires for the flights that never report one.
private let settleFallbackDelay: TimeInterval = 0.4

extension TranscriptListCoordinator {
    func settleAppend(
        view: TranscriptListView<Item, Row, Accessory>,
        table: UITableView,
        previousItems: [Item],
        appended: Int,
        wasNearNewest: Bool
    ) {
        let rest = CGPoint(x: 0, y: -table.contentInset.top)
        switch view.onAppend(previousItems, view.items, wasNearNewest) {
        case .snapToNewest:
            endSettling()
            table.contentOffset = rest
        case .animateToNewest:
            // In flipped space inserted rows appear in place; the ease-in is
            // staged by holding the viewport on the previous newest row and
            // releasing it toward rest, across everything that arrived.
            let insertedHeight = (0..<appended).reduce(CGFloat.zero) { height, row in
                height + table.rectForRow(at: IndexPath(row: row, section: 0)).height
            }
            table.contentOffset = CGPoint(x: 0, y: rest.y + insertedHeight)
            settleToNewest(table: table, rest: rest)
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
        handledRevealToken = reveal.token
        guard let index = items.lastIndex(where: { $0.id == reveal.id }) else { return }
        // The newest item's home is the resting edge, not the viewport center.
        guard index < items.count - 1 else {
            let rest = CGPoint(x: 0, y: -table.contentInset.top)
            if reveal.animated {
                settleToNewest(table: table, rest: rest)
            } else {
                endSettling()
                table.contentOffset = rest
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

    /// Distance from the resting (newest) edge, in points. Zero at rest.
    func distanceFromNewest(_ scrollView: UIScrollView) -> CGFloat {
        scrollView.contentOffset.y + scrollView.contentInset.top
    }

    /// Runs the settle toward the newest edge and publishes the reading it
    /// leaves behind.
    ///
    /// The travel belongs to the scroll view: `setContentOffset(_:animated:)`
    /// moves the real offset frame by frame, so the table lays out the rows the
    /// viewport passes over. A `UIView.animate` block on `contentOffset` looks
    /// the same and is not — it writes the destination offset immediately and
    /// animates only the layer, so the table lays out once, at the destination,
    /// and everything travelled through paints blank.
    ///
    /// What the scroll view does not give back is a guaranteed close.
    /// `scrollViewDidEndScrollingAnimation` is silent when a `contentInset`
    /// write lands mid-flight (the composer collapsing right after a send) and
    /// cancels the travel, and that silence would leave the settle open forever,
    /// publishing "showing the newest item" over a viewport stranded anywhere.
    /// So each settle also carries a deferred fallback, armed a little past
    /// UIKit's own duration; whichever signal arrives first closes the settle
    /// and the other finds its ticket superseded.
    func settleToNewest(table: UITableView, rest: CGPoint) {
        guard table.contentOffset != rest else {
            endSettling()
            scheduleNearNewestSync(table)
            return
        }
        let ticket = nearNewest.beginSettling()
        table.setContentOffset(rest, animated: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + settleFallbackDelay) {
            [weak self, weak table] in
            MainActor.assumeIsolated {
                guard let self, self.nearNewest.endSettling(ticket) else { return }
                guard let table else { return }
                self.scheduleNearNewestSync(table)
            }
        }
    }

    /// Ends any settle in flight and orphans the signals that would have closed
    /// it.
    func endSettling() {
        nearNewest.endSettling()
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
