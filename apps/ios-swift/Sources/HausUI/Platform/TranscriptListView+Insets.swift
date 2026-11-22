import SwiftUI
#if canImport(UIKit)
import UIKit

/// The clearances the screen hands the transcript, applied in flipped space.
extension TranscriptListCoordinator {
    func applyInsets(
        view: TranscriptListView<Item, Row, Accessory>,
        table: UITableView,
        wasNearNewest: Bool
    ) {
        // Flipped mapping: the table's top inset renders at the visual bottom.
        let insets = UIEdgeInsets(
            top: max(Self.baseTailInset(view), landingInsetTop ?? 0),
            left: 0,
            bottom: Self.topClearance(view),
            right: 0
        )
        guard insets != appliedInsets else { return }
        let previousTop = appliedInsets?.top
        let isFirst = previousTop == nil
        appliedInsets = insets
        let rides = isFirst || (wasNearNewest && !table.isDragging && !table.isDecelerating)
        let shrinks = previousTop.map { insets.top < $0 } ?? false
        let eases = rides && (settleTravel != nil || shrinks)
        // UIKit clamps the offset into the inset it is handed; an easing
        // transcript holds it open to where the rows stand until it arrives.
        var tableInsets = insets
        if eases { tableInsets.top = max(insets.top, -table.contentOffset.y) }
        table.contentInset = tableInsets
        table.verticalScrollIndicatorInsets = UIEdgeInsets(
            top: view.bottomInset, left: 0, bottom: view.topInset, right: 0
        )
        // A resting transcript rides an inset change. Growing lifts the newest
        // message at once, so nothing slides under the composer. Shrinking
        // eases: the composer drops its attachment strip in one frame while
        // its glass collapses over several, and a snap dropped the transcript
        // a frame before a send's row arrived. A settle in flight re-reads home.
        guard rides else { return }
        if settleTravel != nil {
            stepSettle(table)
        } else if eases {
            settleToNewest(table: table)
        } else {
            table.contentOffset = CGPoint(x: 0, y: settleHome(table))
        }
    }

    /// The composer's clearance plus the runway under the newest row.
    static func baseTailInset(_ view: TranscriptListView<Item, Row, Accessory>) -> CGFloat {
        view.bottomInset + HausChrome.transcriptBottomRunway
    }

    /// The header's clearance plus the air under it.
    static func topClearance(_ view: TranscriptListView<Item, Row, Accessory>) -> CGFloat {
        view.topInset + 14
    }
}

#endif
