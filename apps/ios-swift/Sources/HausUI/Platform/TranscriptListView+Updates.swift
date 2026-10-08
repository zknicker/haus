import SwiftUI

#if canImport(UIKit)
import UIKit

extension TranscriptListCoordinator {
    func update(view: TranscriptListView<Item, Row, Accessory>, table: UITableView) {
        self.view = view

        // The common update is one that changes nothing about the rows — a
        // drawer pan, a keyboard inset frame. Callers memoize their item
        // arrays, so this comparison is a storage-identity check, and nothing
        // below it walks the transcript.
        let itemsUnchanged = view.items == items
        let update: TranscriptListUpdate = itemsUnchanged
            ? .refresh
            : TranscriptListUpdate.classify(old: items.map(\.id), new: view.items.map(\.id))
        let wasNearNewest = nearNewest.countsAsNear(distance: distanceFromNewest(table))
        let offsetBefore = table.contentOffset.y
        let previousItems = items
        let previousShowsAccessory = showsAccessory
        let revisionChanged = view.rowRevision != appliedRowRevision
        let appendBehavior: TranscriptAppendBehavior? = update.tailInsertionCount > 0
            ? view.onAppend(previousItems, view.items, wasNearNewest)
            : nil
        let preserveAnchor = shouldPreserveAnchor(
            update: update,
            appendBehavior: appendBehavior,
            wasNearNewest: wasNearNewest
        ) && !(itemsUnchanged && !revisionChanged)
            // A followed reply's top owns the viewport; see `holdFollowedTop`.
            && !(followedTopItemID != nil && view.items.last?.id == followedTopItemID)
        let anchor = preserveAnchor
            ? TranscriptScrollAnchor.capture(
                table: table,
                items: previousItems,
                survivingIDs: Set(view.items.map(\.id))
            )
            : nil
        items = view.items
        showsAccessory = view.showsAccessory
        appliedRowRevision = view.rowRevision

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
            // Only rows that add to the tail are staged in. One that replaces
            // a removed newest row (a send confirmed under a new id) is
            // already in view; staging it replayed the send from a row lower.
            var replaced = 0
            if case .window = update {
                replaced = TranscriptListUpdate.replacedTailCount(
                    old: previousItems.map(\.id),
                    new: view.items.map(\.id)
                )
            }
            settleAppend(
                table: table,
                appended: max(0, update.tailInsertionCount - replaced),
                behavior: appendBehavior,
                offsetBefore: offsetBefore,
                wasNearNewest: wasNearNewest
            )
        }

        if update != .reset {
            reconfigure(
                rows: TranscriptRowReconfiguration.rows(
                    visible: (table.indexPathsForVisibleRows ?? []).map(\.row),
                    itemCount: items.count,
                    revisionChanged: revisionChanged,
                    changedItem: itemsUnchanged ? { _ in false } : changedItem(in: previousItems)
                ),
                table: table
            )
        }
        if !(itemsUnchanged && !revisionChanged) {
            table.layoutIfNeeded()
        }
        if let anchor {
            hold(anchor, in: table)
        } else if wasNearNewest {
            // At the tail there is nothing to hold; scrolled away, a no-op
            // update keeps holding what the last real one anchored.
            heldAnchor = nil
        }
        holdFollowedTop(table: table)
        performReveal(view: view, table: table)
        // Covers every path above — a reset's `reloadData`, an inset change, an
        // append's settle — with one reading taken after all of them.
        scheduleNearNewestSync(table)
    }

    /// Whether the item a row now shows differs from what that row's cell was
    /// last configured with. A new id is not "changed": an inserted row was
    /// just configured by the insertion.
    private func changedItem(in previousItems: [Item]) -> (Int) -> Bool {
        let previous = Dictionary(
            previousItems.map { ($0.id, $0) },
            uniquingKeysWith: { first, _ in first }
        )
        return { [items] row in
            let item = items[items.count - 1 - row]
            guard let old = previous[item.id] else { return false }
            return old != item
        }
    }

    /// Re-hosts exactly these rows and lets the table re-measure them. A plain
    /// configuration swap is not enough: the table keeps the height it measured
    /// for the old content, so a row that grew in place (a streamed reply)
    /// drew its new content over the rows around it.
    private func reconfigure(rows: [Int], table: UITableView) {
        reconfiguredRowCount += rows.count
        guard !rows.isEmpty else { return }
        UIView.performWithoutAnimation {
            table.performBatchUpdates {
                table.reconfigureRows(at: rows.map { IndexPath(row: $0, section: 0) })
            }
        }
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
