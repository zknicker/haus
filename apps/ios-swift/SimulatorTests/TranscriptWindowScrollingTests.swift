import SwiftUI
import UIKit
import XCTest
@testable import HausUI

@MainActor
final class TranscriptWindowScrollingTests: XCTestCase {
    func testAReaderAnchorSurvivesPagingAcrossAThousandVariableHeightMessages() throws {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
        let initial = items(start: 0, count: 200)
        let host = UIHostingController(rootView: WindowFixture(items: initial))
        host.view.frame = window.bounds
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer { window.isHidden = true }

        host.view.layoutIfNeeded()
        let table = try XCTUnwrap(table(in: host.view))
        XCTAssertEqual(table.numberOfRows(inSection: 0), initial.count)

        var elapsed = 0.0
        var peakVisibleCells = 0
        let starts = Array(stride(from: 0, through: 800, by: 50))
            + Array(stride(from: 750, through: 0, by: -50))
        for (start, nextStart) in zip(starts, starts.dropFirst()) {
            let oldItems = items(start: start, count: 200)
            let anchorID = "message-\(max(start, nextStart) + 75)"
            let anchorPath = try XCTUnwrap(indexPath(for: anchorID, in: oldItems))
            table.scrollToRow(at: anchorPath, at: .middle, animated: false)
            table.layoutIfNeeded()
            let oldOffset = try XCTUnwrap(viewportOffset(of: anchorID, in: table, items: oldItems))

            let nextItems = items(start: nextStart, count: 200)
            let began = ContinuousClock.now
            host.rootView = WindowFixture(items: nextItems)
            host.view.setNeedsLayout()
            host.view.layoutIfNeeded()
            table.layoutIfNeeded()
            let duration = began.duration(to: .now).components
            elapsed += Double(duration.seconds) * 1_000
                + Double(duration.attoseconds) / 1e15

            let newOffset = try XCTUnwrap(viewportOffset(of: anchorID, in: table, items: nextItems))
            XCTAssertLessThan(
                abs(newOffset - oldOffset),
                1.5,
                "window shift \(start) -> \(nextStart) moved \(anchorID) by \(newOffset - oldOffset)pt"
            )
            peakVisibleCells = max(peakVisibleCells, table.visibleCells.count)
        }

        XCTAssertLessThan(peakVisibleCells, 30, "window updates should keep UIKit's live-cell window bounded")
        print("TRANSCRIPT_WINDOW source=1000 window=200 shifts=32 time_ms= \(elapsed) PEAK_VISIBLE_CELLS \(peakVisibleCells)")
    }

    func testAContentRefreshKeepsAVisibleVariableHeightAnchor() throws {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
        let initial = items(start: 0, count: 40)
        let host = UIHostingController(rootView: WindowFixture(items: initial))
        host.view.frame = window.bounds
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer { window.isHidden = true }

        host.view.layoutIfNeeded()
        let table = try XCTUnwrap(table(in: host.view))
        let anchorID = "message-20"
        table.scrollToRow(
            at: try XCTUnwrap(indexPath(for: anchorID, in: initial)),
            at: .middle,
            animated: false
        )
        table.layoutIfNeeded()
        let oldOffset = try XCTUnwrap(viewportOffset(of: anchorID, in: table, items: initial))

        let changed = initial.map { item in
            WindowItem(id: item.id, body: item.id == anchorID ? String(repeating: "expanded ", count: 24) : item.body)
        }
        host.rootView = WindowFixture(items: changed)
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        table.layoutIfNeeded()

        let newOffset = try XCTUnwrap(viewportOffset(of: anchorID, in: table, items: changed))
        XCTAssertLessThan(abs(newOffset - oldOffset), 1.5)
    }

    func testThreadPrefixAndShiftedReplyWindowKeepTheVisibleReply() throws {
        let prefix = [WindowItem(id: "thread-anchor", body: "Original thread message")]
        try assertStableAnchor(
            old: prefix + items(start: 0, count: 200),
            new: prefix + items(start: 50, count: 200),
            anchorID: "message-100"
        )
    }

    func testAppendingNewerRowsWithStayPolicyPreservesTheViewport() throws {
        try assertStableAnchor(
            old: items(start: 0, count: 100),
            new: items(start: 0, count: 150),
            anchorID: "message-50"
        )
    }

    private func assertStableAnchor(old: [WindowItem], new: [WindowItem], anchorID: String) throws {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
        let host = UIHostingController(rootView: WindowFixture(items: old))
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        host.view.layoutIfNeeded()
        let table = try XCTUnwrap(table(in: host.view))
        table.scrollToRow(at: try XCTUnwrap(indexPath(for: anchorID, in: old)), at: .middle, animated: false)
        table.layoutIfNeeded()
        let previous = try XCTUnwrap(viewportOffset(of: anchorID, in: table, items: old))
        host.rootView = WindowFixture(items: new)
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        table.layoutIfNeeded()
        let current = try XCTUnwrap(viewportOffset(of: anchorID, in: table, items: new))
        XCTAssertLessThan(abs(current - previous), 1.5)
        XCTAssertEqual(table.numberOfRows(inSection: 0), new.count)
    }

    private func items(start: Int, count: Int) -> [WindowItem] {
        (start..<(start + count)).map { index in
            let words = 2 + (index % 11)
            return WindowItem(
                id: "message-\(index)",
                body: String(repeating: "Variable transcript content. ", count: words)
            )
        }
    }

    private func indexPath(for id: String, in items: [WindowItem]) -> IndexPath? {
        guard let itemIndex = items.firstIndex(where: { $0.id == id }) else { return nil }
        return IndexPath(row: items.count - 1 - itemIndex, section: 0)
    }

    private func viewportOffset(
        of id: String,
        in table: UITableView,
        items: [WindowItem]
    ) -> CGFloat? {
        guard let itemIndex = items.firstIndex(where: { $0.id == id }),
              let cell = table.cellForRow(at: IndexPath(row: items.count - 1 - itemIndex, section: 0))
        else { return nil }
        let frame = cell.convert(cell.bounds, to: table)
        guard frame.intersection(table.bounds).height > 0.5 else { return nil }
        return frame.minY - table.bounds.minY
    }

    private func table(in view: UIView) -> UITableView? {
        if let table = view as? UITableView { return table }
        return view.subviews.lazy.compactMap { self.table(in: $0) }.first
    }
}

private struct WindowItem: Identifiable, Equatable {
    let id: String
    let body: String
}

private struct WindowFixture: View {
    let items: [WindowItem]

    var body: some View {
        TranscriptListView(
            items: items,
            topInset: 0,
            bottomInset: 0,
            showsAccessory: false,
            onAppend: { _, _, _ in .stay },
            reveal: nil,
            isNearNewest: .constant(false),
            row: { item in
                Text(item.body)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 8)
            },
            accessory: { EmptyView() }
        )
        .background(Color(uiColor: .systemBackground))
    }
}
