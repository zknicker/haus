#if canImport(UIKit)
import UIKit

extension TranscriptListCoordinator {
    // MARK: Long press

    func installRowPress(on table: UITableView) {
        let press = TranscriptRowPress()
        press.onHoldChange = { [weak self] indexPath in
            guard let self else { return }
            view?.onHoldChange?(indexPath.flatMap(item(at:)))
        }
        press.onPress = { [weak self] indexPath in
            guard let self, let item = item(at: indexPath) else { return }
            view?.onLongPress?(item)
        }
        press.install(on: table)
        rowPress = press
    }

    /// The item a row shows, or nil for the history accessory.
    func item(at indexPath: IndexPath) -> Item? {
        indexPath.row < items.count ? items[items.count - 1 - indexPath.row] : nil
    }
}

extension TranscriptListCoordinator: TranscriptListMetrics {}

#endif
