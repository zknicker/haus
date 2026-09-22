import SwiftUI

#if canImport(UIKit)
import UIKit

extension TranscriptListCoordinator {
    func update(view: TranscriptListView<Item, Row, Accessory>, table: UITableView) {
        self.view = view

        let update = TranscriptListUpdate.classify(
            old: items.map(\.id),
            new: view.items.map(\.id)
        )
        let wasNearNewest = nearNewest.countsAsNear(distance: distanceFromNewest(table))
        let previousItems = items
        let previousShowsAccessory = showsAccessory
        let appendBehavior: TranscriptAppendBehavior? = update.tailInsertionCount > 0
            ? view.onAppend(previousItems, view.items, wasNearNewest)
            : nil
        let preserveAnchor = shouldPreserveAnchor(
            update: update,
            appendBehavior: appendBehavior,
            wasNearNewest: wasNearNewest
        )
        let anchor = preserveAnchor
            ? TranscriptScrollAnchor.capture(
                table: table,
                items: previousItems,
                survivingIDs: Set(view.items.map(\.id))
            )
            : nil
        items = view.items
        showsAccessory = view.showsAccessory

        applyInsets(view: view, table: table, wasNearNewest: wasNearNewest)

        switch update {
        case .refresh where previousShowsAccessory == showsAccessory:
            break
        case .reset:
            table.reloadData()
            table.layoutIfNeeded()
        default:
            applyRowDifference(
                table: table,
                oldItems: previousItems,
                newItems: view.items,
                oldShowsAccessory: previousShowsAccessory,
                newShowsAccessory: view.showsAccessory
            )
        }

        if let appendBehavior {
            settleAppend(
                table: table,
                appended: update.tailInsertionCount,
                behavior: appendBehavior
            )
        }

        reconfigureVisibleRows(table: table)
        table.layoutIfNeeded()
        anchor?.restore(in: table, items: items)
        performReveal(view: view, table: table)
        // Covers every path above — a reset's `reloadData`, an inset change, an
        // append's settle — with one reading taken after all of them.
        scheduleNearNewestSync(table)
    }

    private func shouldPreserveAnchor(
        update: TranscriptListUpdate,
        appendBehavior: TranscriptAppendBehavior?,
        wasNearNewest: Bool
    ) -> Bool {
        switch update {
        case .refresh:
            return !wasNearNewest
        case .append:
            return appendBehavior == .stay
        case .prepend:
            return true
        case .window(let insertedAtTail):
            return insertedAtTail == 0 || appendBehavior == .stay
        case .reset:
            return false
        }
    }

    /// Applies only the rows whose IDs changed. A bounded window can delete
    /// and insert at both ends in one batch, preserving UIKit's live-cell
    /// window and leaving all surviving cells available for the anchor restore.
    private func applyRowDifference(
        table: UITableView,
        oldItems: [Item],
        newItems: [Item],
        oldShowsAccessory: Bool,
        newShowsAccessory: Bool
    ) {
        let oldIDs = Set(oldItems.map(\.id))
        let newIDs = Set(newItems.map(\.id))
        let deletedRows = oldItems.enumerated().compactMap { index, item -> IndexPath? in
            guard !newIDs.contains(item.id) else { return nil }
            return IndexPath(row: oldItems.count - 1 - index, section: 0)
        }
        let insertedRows = newItems.enumerated().compactMap { index, item -> IndexPath? in
            guard !oldIDs.contains(item.id) else { return nil }
            return IndexPath(row: newItems.count - 1 - index, section: 0)
        }
        var deleted = deletedRows
        var inserted = insertedRows
        if oldShowsAccessory, !newShowsAccessory {
            deleted.append(IndexPath(row: oldItems.count, section: 0))
        } else if !oldShowsAccessory, newShowsAccessory {
            inserted.append(IndexPath(row: newItems.count, section: 0))
        }
        guard !deleted.isEmpty || !inserted.isEmpty else { return }

        UIView.performWithoutAnimation {
            table.performBatchUpdates {
                if !deleted.isEmpty {
                    table.deleteRows(at: deleted, with: .none)
                }
                if !inserted.isEmpty {
                    table.insertRows(at: inserted, with: .none)
                }
            }
            table.layoutIfNeeded()
        }
    }
}

#endif
