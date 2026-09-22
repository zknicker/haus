import CoreGraphics

#if canImport(UIKit)
import UIKit

/// A measured point in one item that is currently on screen. The offset is in
/// the table's local viewport coordinates, so it remains meaningful while the
/// flipped table inserts or removes rows elsewhere in the window.
struct TranscriptScrollAnchor: Equatable {
    let itemID: String
    let viewportOffset: CGFloat
}

@MainActor
extension TranscriptScrollAnchor {
    /// Captures a real, intersecting item cell. `indexPathsForVisibleRows`
    /// can include a row while UIKit is still settling its estimated frame;
    /// measuring the cell against the table bounds keeps zero-height or stale
    /// candidates out of the anchor.
    static func capture<Item: Identifiable & Equatable>(
        table: UITableView,
        items: [Item],
        survivingIDs: Set<String>? = nil
    ) -> Self? where Item.ID == String {
        table.layoutIfNeeded()
        let bounds = table.bounds
        let candidates = (table.indexPathsForVisibleRows ?? []).compactMap {
            (indexPath: IndexPath) -> (String, CGFloat, CGFloat)? in
            guard indexPath.section == 0,
                  indexPath.row < items.count,
                  let cell = table.cellForRow(at: indexPath)
            else { return nil }
            let frame = cell.convert(cell.bounds, to: table)
            let visible = frame.intersection(bounds)
            guard visible.height > 0.5 else { return nil }
            let itemIndex = items.count - 1 - indexPath.row
            guard items.indices.contains(itemIndex) else { return nil }
            let itemID = items[itemIndex].id
            guard survivingIDs?.contains(itemID) ?? true else { return nil }
            return (itemID, frame.minY - bounds.minY, visible.height)
        }

        // Prefer a row with enough visible pixels to remain an unambiguous
        // anchor, then prefer the row closest to the visual top. The caller
        // still verifies that the id survives the new snapshot.
        guard let candidate = candidates.max(by: { lhs, rhs in
            if lhs.2 != rhs.2 { return lhs.2 < rhs.2 }
            return lhs.1 < rhs.1
        }) else {
            return nil
        }
        return Self(itemID: candidate.0, viewportOffset: candidate.1)
    }

    /// Moves the table just enough to put the surviving item's measured edge
    /// back at its old viewport offset. `rectForRow` uses the table's content
    /// coordinate space, so the same delta works for the vertically flipped
    /// table without instantiating off-screen rows.
    func restore<Item: Identifiable & Equatable>(
        in table: UITableView,
        items: [Item]
    ) where Item.ID == String {
        guard let itemIndex = items.firstIndex(where: { $0.id == itemID }) else { return }
        let row = items.count - 1 - itemIndex
        let indexPath = IndexPath(row: row, section: 0)
        table.layoutIfNeeded()
        let currentOffset = table.rectForRow(at: indexPath).minY - table.bounds.minY
        let delta = currentOffset - viewportOffset
        guard abs(delta) > 0.25 else { return }
        table.setContentOffset(
            CGPoint(x: table.contentOffset.x, y: table.contentOffset.y + delta),
            animated: false
        )
        table.layoutIfNeeded()
    }
}

#endif
