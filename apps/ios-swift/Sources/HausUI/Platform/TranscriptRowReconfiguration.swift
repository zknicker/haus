/// Which on-screen rows an update must re-host.
///
/// Re-hosting a row rebuilds its SwiftUI tree and re-measures it, so it is the
/// most expensive thing an update does. A row is re-hosted only when what it
/// draws changed: its own item, or the screen state every row reads
/// (`rowRevision`). An update that only moves an inset — every frame of a
/// drawer pan or a keyboard rise — re-hosts nothing.
enum TranscriptRowReconfiguration {
    /// - Parameters:
    ///   - visible: the table rows on screen; rows at or past `itemCount` are
    ///     the history accessory.
    ///   - changedItem: whether the item a row shows differs from the one its
    ///     cell was configured with.
    static func rows(
        visible: [Int],
        itemCount: Int,
        revisionChanged: Bool,
        changedItem: (Int) -> Bool
    ) -> [Int] {
        visible.filter { row in
            if revisionChanged { return true }
            return row < itemCount && changedItem(row)
        }
    }
}

/// What a mounted transcript has spent re-hosting rows, for tests that pin
/// an update's cost.
@MainActor
protocol TranscriptListMetrics: AnyObject {
    var reconfiguredRowCount: Int { get }
}
