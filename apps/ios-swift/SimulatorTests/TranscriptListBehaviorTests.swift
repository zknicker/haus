import SwiftUI
import UIKit
import XCTest
@testable import HausUI

/// The flipped-table substrate under real UIKit layout: what an update costs,
/// and where the viewport rests after a send or a long reply.
@MainActor
final class TranscriptListBehaviorTests: XCTestCase {
    /// A drawer pan or keyboard rise changes only the bottom inset, every
    /// frame. That must not re-host a single row.
    func testInsetOnlyUpdateReHostsNoRows() throws {
        let harness = Harness(items: (0..<30).map { Row(id: "m\($0)", height: 60) })
        let metrics = try XCTUnwrap(harness.table.dataSource as? TranscriptListMetrics)
        let before = metrics.reconfiguredRowCount

        for inset in stride(from: 80, through: 380, by: 20) {
            harness.model.bottomInset = CGFloat(inset)
            harness.pump()
        }
        XCTAssertEqual(metrics.reconfiguredRowCount, before)
        XCTAssertEqual(harness.distanceFromNewest(), 0, accuracy: 0.5)
    }

    /// A changed item re-hosts its own row and nothing else on screen.
    func testChangedItemReHostsOnlyItsRow() throws {
        var items = (0..<30).map { Row(id: "m\($0)", height: 60) }
        let harness = Harness(items: items)
        let metrics = try XCTUnwrap(harness.table.dataSource as? TranscriptListMetrics)
        let before = metrics.reconfiguredRowCount

        items[29] = Row(id: "m29", height: 120)
        harness.model.items = items
        harness.pump()

        XCTAssertEqual(metrics.reconfiguredRowCount, before + 1)
        // And the table re-measured it, rather than drawing the taller row
        // over its neighbours.
        XCTAssertEqual(harness.table.rectForRow(at: IndexPath(row: 0, section: 0)).height, 120, accuracy: 1)
    }

    /// Sending from a tall draft: the composer collapses and the pending row
    /// lands, in either order. The newest row must end resting above the
    /// composer, not under it.
    func testSendFromTallDraftRestsOnTheNewestRow() throws {
        for order in [SendOrder.collapseFirst, .appendFirst, .together] {
            var items = (0..<30).map { Row(id: "m\($0)", height: 60) }
            let harness = Harness(items: items, bottomInset: 320)
            items.append(Row(id: "pending", height: 60, behavior: .animateToNewest))
            switch order {
            case .collapseFirst:
                harness.model.bottomInset = 120
                harness.pump()
                harness.model.items = items
            case .appendFirst:
                harness.model.items = items
                harness.pump()
                harness.model.bottomInset = 120
            case .together:
                harness.model.bottomInset = 120
                harness.model.items = items
            }
            harness.settle()
            XCTAssertEqual(harness.distanceFromNewest(), 0, accuracy: 0.5, "\(order)")
            XCTAssertTrue(harness.model.isNearNewest, "\(order)")
        }
    }

    /// A reply taller than the viewport arrives while the reader is at the
    /// tail: its top comes into view, and stays there as it grows.
    func testLongReplyBringsItsTopIntoView() throws {
        var items = (0..<30).map { Row(id: "m\($0)", height: 60) }
        let harness = Harness(items: items)
        items.append(Row(id: "reply", height: 300, behavior: .followNewest))
        harness.model.items = items
        harness.settle()
        // Shorter than the viewport: it simply rests at the tail.
        XCTAssertEqual(harness.distanceFromNewest(), 0, accuracy: 0.5)

        items[30] = Row(id: "reply", height: 1_400, behavior: .followNewest)
        harness.model.items = items
        harness.settle()
        XCTAssertEqual(harness.newestTopFromViewportTop(), 0, accuracy: 1)

        items[30] = Row(id: "reply", height: 1_900, behavior: .followNewest)
        harness.model.items = items
        harness.settle()
        XCTAssertEqual(harness.newestTopFromViewportTop(), 0, accuracy: 1)
        XCTAssertFalse(harness.model.isNearNewest)
    }

    /// A reader who scrolled up is never moved by a long reply.
    func testLongReplyLeavesAScrolledReaderAlone() throws {
        var items = (0..<30).map { Row(id: "m\($0)", height: 72) }
        let harness = Harness(items: items)
        harness.table.contentOffset.y += 600
        harness.settle()
        let before = harness.visibleRowPositions()
        items.append(Row(id: "reply", height: 1_400, behavior: .followNewest))
        harness.model.items = items
        harness.settle()
        let after = harness.visibleRowPositions()
        // The row the reader was looking at stays where it was, and the long
        // reply's late layout does not push the viewport off it.
        let held = before.keys.filter { id in
            after[id].map { abs($0 - before[id]!) < 1 } ?? false
        }
        XCTAssertFalse(held.isEmpty, "before \(before) after \(after)")
        XCTAssertNil(after["reply"])
        XCTAssertFalse(harness.model.isNearNewest)
    }

    // MARK: Harness

    private enum SendOrder { case collapseFirst, appendFirst, together }

    struct Row: Identifiable, Equatable {
        let id: String
        let height: CGFloat
        var behavior: TranscriptAppendBehavior = .followNewest
    }

    @MainActor
    final class Model: ObservableObject {
        @Published var items: [Row]
        @Published var bottomInset: CGFloat
        @Published var isNearNewest = true
        init(items: [Row], bottomInset: CGFloat) {
            self.items = items
            self.bottomInset = bottomInset
        }
    }

    struct Screen: View {
        @ObservedObject var model: Model

        var body: some View {
            TranscriptListView(
                items: model.items,
                topInset: 100,
                bottomInset: model.bottomInset,
                showsAccessory: false,
                onAppend: { _, items, isNear in
                    isNear || items.last?.behavior == .animateToNewest
                        ? items.last?.behavior ?? .stay
                        : .stay
                },
                reveal: nil,
                isNearNewest: $model.isNearNewest,
                row: { row in Color.gray.frame(height: row.height) },
                accessory: { EmptyView() }
            )
            .ignoresSafeArea()
        }
    }

    @MainActor
    final class Harness {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
        let model: Model
        let host: UIHostingController<Screen>

        init(items: [Row], bottomInset: CGFloat = 120) {
            model = Model(items: items, bottomInset: bottomInset)
            host = UIHostingController(rootView: Screen(model: model))
            window.rootViewController = host
            window.makeKeyAndVisible()
            pump()
        }

        deinit { MainActor.assumeIsolated { window.isHidden = true } }

        var table: UITableView { Self.table(in: host.view)! }

        func pump() {
            host.view.setNeedsLayout()
            host.view.layoutIfNeeded()
            RunLoop.main.run(until: Date().addingTimeInterval(0.02))
        }

        /// Long enough for a settle's travel and its fallback to close.
        func settle() {
            pump()
            RunLoop.main.run(until: Date().addingTimeInterval(0.6))
            pump()
        }

        func distanceFromNewest() -> CGFloat {
            table.contentOffset.y + table.contentInset.top
        }

        /// How far the newest row's top sits below the visual top clearance;
        /// zero when it is exactly in view at the top.
        func newestTopFromViewportTop() -> CGFloat {
            let newest = table.rectForRow(at: IndexPath(row: 0, section: 0))
            let viewportTop = table.contentOffset.y + table.bounds.height - table.contentInset.bottom
            return viewportTop - newest.maxY
        }

        /// Each on-screen item's position in the viewport.
        func visibleRowPositions() -> [String: CGFloat] {
            let items = model.items
            return Dictionary(uniqueKeysWithValues: (table.indexPathsForVisibleRows ?? []).map { path in
                (
                    items[items.count - 1 - path.row].id,
                    table.rectForRow(at: path).minY - table.contentOffset.y
                )
            })
        }

        static func table(in view: UIView) -> UITableView? {
            if let table = view as? UITableView { return table }
            return view.subviews.lazy.compactMap { table(in: $0) }.first
        }
    }
}
