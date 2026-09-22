import SwiftUI
import UIKit
import XCTest
@testable import HausUI

@MainActor
final class LongTranscriptPerformanceTests: XCTestCase {
    func testThousandMessageHistoryWithBoundedRendering() throws {
        let history = (0..<1_000).map { index in
            MessagePresentation(
                id: "long-\(index)",
                author: MessageAuthorPresentation(id: "agent-\(index % 3)", name: "Agent \(index % 3)", avatarURL: nil),
                content: """
                Update **\(index)**: \(String(repeating: "A detailed progress update with variable length. ", count: index % 4 + 1))

                - Check [the documentation](https://example.com/docs).
                - Keep inline `code` and **emphasis** visible.

                \(String(repeating: "The next step is to verify the interaction. ", count: index % 3 + 1))
                """,
                createdAt: Date(timeIntervalSince1970: 1_700_000_000 + Double(index))
            )
        }
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
        let host = UIHostingController(rootView: timeline(history: history, start: 800, chat: 0))
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        host.view.layoutIfNeeded()
        let initial = try XCTUnwrap(table(in: host.view))
        XCTAssertEqual(initial.numberOfRows(inSection: 0), 200)
        var peakVisible = initial.visibleCells.count
        let start = ContinuousClock.now
        for chat in 1...10 {
            host.rootView = timeline(history: history, start: (chat % 5) * 200, chat: chat)
            host.view.setNeedsLayout()
            host.view.layoutIfNeeded()
            let table = try XCTUnwrap(table(in: host.view))
            XCTAssertEqual(table.numberOfRows(inSection: 0), 200)
            peakVisible = max(peakVisible, table.visibleCells.count)
        }
        let switchMS = milliseconds(start.duration(to: .now))
        let table = try XCTUnwrap(table(in: host.view))
        let scrolling = ContinuousClock.now
        for step in 0..<100 {
            table.contentOffset.y = -table.contentInset.top + CGFloat(step < 50 ? step : 99 - step) * 80
            table.layoutIfNeeded()
            peakVisible = max(peakVisible, table.visibleCells.count)
        }
        let scrollMS = milliseconds(scrolling.duration(to: .now))
        XCTAssertLessThan(peakVisible, 30)
        print("LONG_TRANSCRIPT source=1000 window=200 switches=10 switch_ms=\(switchMS) scroll_steps=100 scroll_ms=\(scrollMS) peak_visible_cells=\(peakVisible)")
    }

    private func timeline(history: [MessagePresentation], start: Int, chat: Int) -> some View {
        MessageTimelineView(messages: Array(history[start..<start + 200]), onOpenThread: { _ in })
            .id(chat)
    }

    private func table(in view: UIView) -> UITableView? {
        if let table = view as? UITableView { return table }
        return view.subviews.lazy.compactMap { self.table(in: $0) }.first
    }

    private func milliseconds(_ duration: Duration) -> Double {
        let parts = duration.components
        return Double(parts.seconds) * 1000 + Double(parts.attoseconds) / 1e15
    }
}
