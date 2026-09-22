import Observation
import SwiftUI
import UIKit
import XCTest
@testable import HausUI

@MainActor
final class MessageHistoryNavigationTests: XCTestCase {
    func testSearchRevealsDistantMessageWithOneRequest() async throws {
        let source = HistorySource()
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
        let host = UIHostingController(rootView: HistoryTimeline(source: source))
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        host.view.layoutIfNeeded()
        try await Task.sleep(for: .milliseconds(800))
        host.view.layoutIfNeeded()

        XCTAssertEqual(source.aroundRequests, ["message-50"])
        XCTAssertEqual(source.messages.count, 50)
        XCTAssertNil(source.target)
        let table = try XCTUnwrap(table(in: host.view))
        let index = try XCTUnwrap(source.messages.reversed().firstIndex { $0.id == "message-50" })
        let row = source.messages.reversed().distance(from: source.messages.reversed().startIndex, to: index)
        XCTAssertTrue(table.indexPathsForVisibleRows?.contains(IndexPath(row: row, section: 0)) == true,
                      "Target row \(row), visible \(table.indexPathsForVisibleRows ?? []), offset \(table.contentOffset), rows \(table.numberOfRows(inSection: 0))")
    }

    private func table(in view: UIView) -> UITableView? {
        if let table = view as? UITableView { return table }
        return view.subviews.lazy.compactMap { self.table(in: $0) }.first
    }
}

@MainActor
@Observable
private final class HistorySource {
    let allMessages = (0..<1_000).map { index in
        MessagePresentation(
            id: "message-\(index)",
            author: MessageAuthorPresentation(id: "author", name: "Test agent", avatarURL: nil),
            content: "Message \(index). " + String(repeating: "A variable-height paragraph. ", count: index % 5 + 1),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000 + Double(index))
        )
    }
    var messages: [MessagePresentation] = []
    var target: String? = "message-50"
    var aroundRequests: [String] = []

    init() { messages = Array(allMessages.suffix(200)) }

    func loadAround(_ id: String) async -> Bool {
        aroundRequests.append(id)
        guard let index = allMessages.firstIndex(where: { $0.id == id }) else { return false }
        await Task.yield()
        messages = Array(allMessages[max(0, index - 25)..<min(allMessages.count, index + 25)])
        return true
    }
}

private struct HistoryTimeline: View {
    @Bindable var source: HistorySource

    var body: some View {
        MessageTimelineView(
            messages: source.messages,
            onOpenThread: { _ in },
            history: MessageHistoryNavigation(hasOlder: true, hasNewer: true, loadAround: source.loadAround),
            scrollTargetMessageID: $source.target
        )
    }
}
