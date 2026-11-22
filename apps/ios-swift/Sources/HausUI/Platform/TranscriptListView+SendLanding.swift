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

    /// Measures the room the landed row needs from the rows as laid out now
    /// and records it as the applied inset. It moves nothing; returns whether
    /// the applied inset changed.
    @discardableResult
    func measureSendLanding(_ table: UITableView) -> Bool {
        guard let landedItemID, let view, let applied = appliedInsets else { return false }
        guard let index = items.lastIndex(where: { $0.id == landedItemID }) else {
            self.landedItemID = nil
            landingInsetTop = nil
            return false
        }
        let row = items.count - 1 - index
        guard row < table.numberOfRows(inSection: 0), table.bounds.height > 0 else { return false }
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
        let top = max(base, landingInsetTop ?? 0)
        guard abs(applied.top - top) > 0.5 else { return false }
        appliedInsets?.top = top
        return true
    }

    /// Re-measures after rows were laid out and keeps a resting landed row
    /// where it stands.
    func holdSendLanding(_ table: UITableView) {
        guard landedItemID != nil, !isReapplyingAnchor else { return }
        let wasResting = abs(table.contentOffset.y - restingOffset(table)) < 0.5
            && !table.isDragging
            && !table.isDecelerating
        guard measureSendLanding(table), let top = appliedInsets?.top else { return }
        isReapplyingAnchor = true
        defer { isReapplyingAnchor = false }
        if nearNewest.isSettling {
            table.contentInset.top = max(top, -table.contentOffset.y)
            stepSettle(table)
        } else if wasResting {
            setTravelOffset(-top, in: table)
        } else {
            table.contentInset.top = max(top, -table.contentOffset.y)
        }
    }
}

#endif
