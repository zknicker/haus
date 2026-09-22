import Foundation
import CoreGraphics
import Testing
@testable import HausUI

/// The registry is what lets a card grow: the screen reads `revision`, so every
/// bump re-hosts every visible row. A frame reports two or three times per load,
/// so the bumps are coalesced.
@MainActor
struct VisualHeightRegistryTests {
    private func key(_ ordinal: Int) -> VisualKey {
        VisualKey(messageID: "msg_1", ordinal: ordinal)
    }

    @Test func storesEveryReportImmediately() {
        let registry = VisualHeightRegistry()

        registry.report(300, for: key(1))
        registry.report(500, for: key(2))

        #expect(registry.height(key(1)) == 300)
        #expect(registry.height(key(2)) == 500)
    }

    @Test func coalescesManyReportsInOneTurnIntoOneRevision() async {
        let registry = VisualHeightRegistry()

        // What one load actually looks like: DOMContentLoaded, the
        // ResizeObserver, then `load` — times the cards on screen.
        registry.report(240, for: key(1))
        registry.report(300, for: key(1))
        registry.report(320, for: key(1))
        registry.report(500, for: key(2))
        #expect(registry.revision == 0)

        await Task.yield()

        #expect(registry.revision == 1)
    }

    @Test func bumpsAgainOnALaterTurn() async {
        let registry = VisualHeightRegistry()

        registry.report(300, for: key(1))
        await Task.yield()
        registry.report(420, for: key(1))
        await Task.yield()

        #expect(registry.revision == 2)
    }

    @Test func ignoresNonsenseAndUnchangedHeights() async {
        let registry = VisualHeightRegistry()

        registry.report(.nan, for: key(1))
        registry.report(0, for: key(1))
        registry.report(-40, for: key(1))
        await Task.yield()
        #expect(registry.revision == 0)
        #expect(registry.height(key(1)) == nil)

        registry.report(300, for: key(1))
        await Task.yield()
        registry.report(300, for: key(1))
        await Task.yield()
        #expect(registry.revision == 1)
    }

    @Test func evictsMeasurementsOutsideTheLoadedHistoryWindow() {
        let registry = VisualHeightRegistry()
        for index in 0..<1_000 {
            registry.report(300, for: VisualKey(messageID: "message-\(index)", ordinal: 0))
        }
        registry.retain(messageIDs: Set((800..<1_000).map { "message-\($0)" }))
        #expect(registry.height(VisualKey(messageID: "message-799", ordinal: 0)) == nil)
        #expect(registry.height(VisualKey(messageID: "message-800", ordinal: 0)) == 300)
        #expect(registry.height(VisualKey(messageID: "message-999", ordinal: 0)) == 300)
    }

    @Test func naturalHeightGrowsAndShrinksWithAResourceGuard() {
        let registry = VisualHeightRegistry()
        for height: CGFloat in [700, 2400, 300] {
            registry.report(height, for: key(1))
            #expect(registry.height(key(1)) == height)
        }
        registry.report(1_000_000, for: key(1))
        #expect(registry.height(key(1)) == VisualHeights.maximum)
        registry.report(.infinity, for: key(1))
        #expect(registry.height(key(1)) == VisualHeights.maximum)
    }
}
