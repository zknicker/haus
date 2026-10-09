import SwiftUI
import UIKit
import XCTest
@testable import HausUI

/// A fenced code block inside a self-sizing transcript cell must lay out every
/// line it measured for. The regression: the row sized itself for all thirty
/// lines while the plate drew one truncated line in the middle, leaving a
/// tall blank band above and below it.
@MainActor
final class CodeBlockRowLayoutTests: XCTestCase {
    func testCodeBlockOnFirstPaintLaysOutEveryLine() throws {
        let harness = Harness(messages: [Self.codeMessage(lines: Self.lineCount)])
        try harness.assertCodeRow(lines: Self.lineCount)
    }

    func testAppendedCodeBlockLaysOutEveryLine() throws {
        let harness = Harness(messages: [Self.prose("a"), Self.prose("b")])
        harness.show([Self.prose("a"), Self.prose("b"), Self.codeMessage(lines: Self.lineCount)])
        try harness.assertCodeRow(lines: Self.lineCount)
    }

    /// A reply streams in: the same row grows from one fenced line to thirty.
    func testStreamedCodeBlockLaysOutEveryLine() throws {
        let harness = Harness(messages: [Self.prose("a"), Self.codeMessage(lines: 1)])
        for lines in [2, 8, 16, Self.lineCount] {
            harness.show([Self.prose("a"), Self.codeMessage(lines: lines)])
        }
        try harness.assertCodeRow(lines: Self.lineCount)
    }

    /// A recycled cell that last hosted a short row must not keep its height.
    func testRecycledCellLaysOutEveryLine() throws {
        let short = (0..<30).map { Self.prose("s\($0)") }
        let harness = Harness(messages: short)
        harness.show(short + [Self.codeMessage(lines: Self.lineCount)])
        try harness.assertCodeRow(lines: Self.lineCount)
    }

    @MainActor
    private final class Harness {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
        let host: UIHostingController<MessageTimelineView>

        init(messages: [MessagePresentation]) {
            window.overrideUserInterfaceStyle = .light
            host = UIHostingController(
                rootView: MessageTimelineView(messages: messages, onOpenThread: { _ in })
            )
            window.rootViewController = host
            window.makeKeyAndVisible()
            pump()
        }

        func show(_ messages: [MessagePresentation]) {
            host.rootView = MessageTimelineView(messages: messages, onOpenThread: { _ in })
            pump()
        }

        private func pump() {
            for _ in 0..<3 {
                host.view.setNeedsLayout()
                host.view.layoutIfNeeded()
                RunLoop.main.run(until: Date().addingTimeInterval(0.05))
            }
        }

        func assertCodeRow(lines: Int, file: StaticString = #filePath, line: UInt = #line) throws {
            defer { window.isHidden = true }
            let table = try XCTUnwrap(CodeBlockRowLayoutTests.table(in: host.view))
            table.layoutIfNeeded()
            let cell = try XCTUnwrap(table.cellForRow(at: IndexPath(row: 0, section: 0)))
            cell.layoutIfNeeded()

            let lineHeight = UIFont.monospacedSystemFont(
                ofSize: UIFont.preferredFont(forTextStyle: .body).pointSize,
                weight: .regular
            ).lineHeight
            let codeHeight = lineHeight * CGFloat(lines)
            // Header line, the plate's language/copy row, its own padding,
            // and the row gap; anything far past this is the blank band the
            // bug left behind.
            XCTAssertGreaterThan(cell.bounds.height, codeHeight, file: file, line: line)
            XCTAssertLessThan(cell.bounds.height, codeHeight + 200, file: file, line: line)

            // The plate is a horizontal scroll view whose content is the laid-
            // out text, so a truncated block reads as a short content height
            // inside a tall frame.
            let scroller = try XCTUnwrap(CodeBlockRowLayoutTests.scrollViews(in: cell.contentView).first)
            XCTAssertGreaterThan(scroller.contentSize.height, codeHeight, file: file, line: line)
            XCTAssertEqual(scroller.contentSize.height, scroller.bounds.height, accuracy: 1, file: file, line: line)
            // The plate keeps the column's trailing margin.
            let plate = scroller.convert(scroller.bounds, to: cell)
            XCTAssertLessThanOrEqual(plate.maxX, cell.bounds.width - 16 + 0.5, file: file, line: line)
            // The longest line is wider than the column, so it scrolls.
            XCTAssertGreaterThan(scroller.contentSize.width, scroller.bounds.width, file: file, line: line)
        }
    }

    static func scrollViews(in view: UIView) -> [UIScrollView] {
        view.subviews.flatMap { subview -> [UIScrollView] in
            subview is UITextView ? [] : (subview as? UIScrollView).map { [$0] } ?? Self.scrollViews(in: subview)
        }
    }

    static func table(in view: UIView) -> UITableView? {
        if let table = view as? UITableView { return table }
        return view.subviews.lazy.compactMap { Self.table(in: $0) }.first
    }

    private static let lineCount = 30

    private static func codeMessage(lines: Int) -> MessagePresentation {
        MessagePresentation(
            id: "code",
            author: MessageAuthorPresentation(id: "agent", name: "Blippy", avatarURL: nil),
            content: "Here is the view:\n\n```swift\n" + (0..<lines).map { index in
                index == 0 ? "import SwiftUI" : "let value\(index) = compute(\(index)) // a long trailing comment on line \(index)"
            }.joined(separator: "\n") + "\n```",
            createdAt: Date(timeIntervalSince1970: 1_700_000_100)
        )
    }

    private static func prose(_ id: String) -> MessagePresentation {
        MessagePresentation(
            id: id,
            author: MessageAuthorPresentation(id: "human", name: "Zach", avatarURL: nil),
            content: "Can you show me the view?",
            createdAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }
}
