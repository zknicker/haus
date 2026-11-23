import SwiftUI
#if canImport(UIKit)
import UIKit

/// The send landing's room as the table's top inset (`TranscriptSendLanding`).
extension TranscriptListCoordinator {
    /// Carries the landing across an update's id change before anything
    /// reads it.
    func reconcileSendLanding(oldItems: [Item], newItems: [Item], update: TranscriptListUpdate) {
        guard landedItemID != nil else { return }
        landedItemID = update == .reset
            ? nil
            : TranscriptSendLanding.reconcile(
                landedItemID,
                old: oldItems.map(\.id),
                new: newItems.map(\.id)
            )
        if landedItemID == nil { landingInsetTop = nil }
    }

    /// Opens a landing on the newest row, the send that just arrived.
    func beginSendLanding() {
        landedItemID = items.last?.id
        landingInsetTop = nil
    }

    /// Measures the room the landed row needs from the rows as laid out now.
    /// It moves nothing; `refreshRestingInset` folds it into the applied inset.
    func measureSendLanding(_ table: UITableView) {
        guard let landedItemID, let view else { return }
        guard let index = items.lastIndex(where: { $0.id == landedItemID }) else {
            self.landedItemID = nil
            landingInsetTop = nil
            return
        }
        let row = items.count - 1 - index
        guard row < table.numberOfRows(inSection: 0), table.bounds.height > 0 else { return }
        let landedHeight = table.rectForRow(at: IndexPath(row: row, section: 0)).maxY
        let base = Self.baseTailInset(view)
        let clearance = Self.topClearance(view)
        if TranscriptSendLanding.isFilled(
            base: base,
            boundsHeight: table.bounds.height,
            topClearance: clearance,
            landedHeight: landedHeight
        ) {
            self.landedItemID = nil
            landingInsetTop = nil
        } else {
            landingInsetTop = TranscriptSendLanding.tailInset(
                base: base,
                boundsHeight: table.bounds.height,
                topClearance: clearance,
                landedHeight: landedHeight
            )
        }
    }
}

#endif
