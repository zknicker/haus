import Foundation
@testable import HausUI
import Testing

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// A Captain's prose reads on 22 pt lines at 15 pt; everything else keeps the
/// font's own line. The text engine that draws the body also measures it, so
/// the laid-out line pitch is the row height the transcript gets.
@MainActor
struct RichMessageLineHeightTests {
    private let sentence = "Rotating the deploy tokens, then the staging keys, then I will check the Worker logs again."

    @Test func assistantProseSetsEveryLineAt22PointsFor15PointType() {
        let body = RichMessageLineHeight.assistantProse.applied(to: text(pointSize: 15))
        let lines = lineHeights(body, width: 160)
        #expect(lines.count > 1)
        #expect(lines.allSatisfy { $0 == 22 })
    }

    @Test func theLineHeightScalesWithTheBodySize() {
        #expect(RichMessageLineHeight.assistantProse.lineHeight(pointSize: 15) == 22)
        #expect(RichMessageLineHeight.assistantProse.lineHeight(pointSize: 17) == 25)
        #expect(RichMessageLineHeight.assistantProse.lineHeight(pointSize: 23) == 34)
        #expect(RichMessageLineHeight.natural.lineHeight(pointSize: 17) == nil)
    }

    @Test func naturalLinesKeepTheFontsOwnBox() {
        let plain = text(pointSize: 17)
        let body = RichMessageLineHeight.natural.applied(to: plain)
        #expect(body.isEqual(to: plain))
        #expect(lineHeights(body, width: 160).allSatisfy { $0 < 24 })
    }

    @Test func anEmptyBodyStaysEmpty() {
        let empty = NSAttributedString()
        #expect(RichMessageLineHeight.assistantProse.applied(to: empty).length == 0)
    }

    private func text(pointSize: CGFloat) -> NSAttributedString {
        NSAttributedString(string: sentence, attributes: [.font: PlatformFont.systemFont(ofSize: pointSize)])
    }

    private func lineHeights(_ body: NSAttributedString, width: CGFloat) -> [CGFloat] {
        let storage = NSTextStorage(attributedString: body)
        let layoutManager = NSLayoutManager()
        let container = NSTextContainer(size: CGSize(width: width, height: .greatestFiniteMagnitude))
        container.lineFragmentPadding = 0
        layoutManager.addTextContainer(container)
        storage.addLayoutManager(layoutManager)
        layoutManager.ensureLayout(for: container)
        var heights: [CGFloat] = []
        layoutManager.enumerateLineFragments(
            forGlyphRange: NSRange(location: 0, length: layoutManager.numberOfGlyphs)
        ) { rect, _, _, _, _ in
            heights.append(rect.height)
        }
        return heights
    }
}
