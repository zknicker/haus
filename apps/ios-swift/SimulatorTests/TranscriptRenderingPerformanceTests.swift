import SwiftUI
import UIKit
import XCTest
@testable import HausUI

@MainActor
final class TranscriptRenderingPerformanceTests: XCTestCase {
    func testChatSwitchPerformance() {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
        let host = UIHostingController(rootView: timeline(chat: 0))
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        host.view.layoutIfNeeded()

        measure {
            for chat in 1...10 {
                host.rootView = timeline(chat: chat)
                host.view.setNeedsLayout()
                host.view.layoutIfNeeded()
            }
        }
        XCTAssertNotNil(table(in: host.view))
    }

    func testTranscriptScrollPerformance() throws {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
        let host = UIHostingController(rootView: timeline(chat: 0))
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        host.view.layoutIfNeeded()
        let table = try XCTUnwrap(table(in: host.view))
        XCTAssertEqual(table.numberOfRows(inSection: 0), 24)
        XCTAssertGreaterThan(table.contentSize.height, table.bounds.height)

        measure {
            for step in 0..<40 {
                let distance = CGFloat(step < 20 ? step : 39 - step) * 50
                table.contentOffset.y = -table.contentInset.top + distance
                table.layoutIfNeeded()
            }
        }
    }

    private func timeline(chat: Int) -> some View {
        MessageTimelineView(messages: Self.messages, onOpenThread: { _ in })
            .id(chat)
    }

    private func table(in view: UIView) -> UITableView? {
        if let table = view as? UITableView { return table }
        return view.subviews.lazy.compactMap { self.table(in: $0) }.first
    }

    private static let messages = (0..<24).map { index in
        MessagePresentation(
            id: "message-\(index)",
            author: MessageAuthorPresentation(id: "agent-\(index % 2)", name: "Agent \(index % 2)", avatarURL: nil),
            content: """
            Here is a short update on the changes we discussed. The latest version is ready for a closer look.

            - Keep the message history visible while switching chats.
            - Check **scrolling** and [the documentation](https://example.com/docs).
            - Preserve selection and inline `code` styling.

            The next step is to verify the same interaction again.
            """,
            createdAt: Date(timeIntervalSince1970: 1_700_000_000 + Double(index * 60))
        )
    }
}
