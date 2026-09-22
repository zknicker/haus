import SwiftUI
import UIKit
import XCTest
@testable import HausUI

@MainActor
final class MessageRenderingPerformanceTests: XCTestCase {
    func testRepeatedTextMeasurementPerformance() {
        let view = makeTextView()
        let sizes = [320.0, 280.0, 320.0, 280.0].map {
            CGSize(width: $0, height: CGFloat.greatestFiniteMagnitude)
        }
        for size in sizes { _ = view.sizeThatFits(size) }
        measure {
            for _ in 0..<100 {
                for size in sizes { _ = view.sizeThatFits(size) }
            }
        }
    }

    func testTextMeasurementTracksWidthAndContent() {
        let view = makeTextView()
        let wide = CGSize(width: 320, height: CGFloat.greatestFiniteMagnitude)
        let narrow = CGSize(width: 140, height: CGFloat.greatestFiniteMagnitude)
        let wideSize = view.sizeThatFits(wide)
        let narrowSize = view.sizeThatFits(narrow)
        XCTAssertGreaterThan(narrowSize.height, wideSize.height)
        XCTAssertEqual(view.sizeThatFits(wide), wideSize)
        view.attributedText = NSAttributedString(string: "Short reply", attributes: [.font: UIFont.systemFont(ofSize: 17)])
        XCTAssertLessThan(view.sizeThatFits(wide).height, wideSize.height)
    }

    func testConcurrentAvatarLoadsShareDecodedImage() async throws {
        let cache = AvatarImageCache()
        let url = try XCTUnwrap(URL(string: "https://example.com/performance-avatar.png"))
        let bytes = avatarBytes()
        async let first = cache.load(url: url) { _ in
            try? await Task.sleep(for: .milliseconds(20))
            return bytes
        }
        async let second = cache.load(url: url) { _ in bytes }
        let (a, b) = await (first, second)
        XCTAssertNotNil(a)
        XCTAssertTrue(a === b, "Rows waiting for one URL should share its decode, not only its download")
    }

    func testAvatarDecodeIsBoundedForProfileAndTranscript() async throws {
        let cache = AvatarImageCache()
        let url = try XCTUnwrap(URL(string: "https://example.com/large-avatar.png"))
        let bytes = avatarBytes()
        let loaded = await cache.load(url: url) { _ in bytes }
        let image = try XCTUnwrap(loaded)
        let bitmap = try XCTUnwrap(image.cgImage)
        XCTAssertEqual(bitmap.width, 384)
        XCTAssertEqual(bitmap.height, 384)
    }

    func testTextMeasurementMatchesUIKitAfterWidthAndTypeChanges() {
        let view = makeTextView()
        let reference = UITextView()
        reference.isScrollEnabled = false
        reference.textContainerInset = .zero
        reference.textContainer.lineFragmentPadding = 0
        for size: DynamicTypeSize in [.large, .accessibility3, .small] {
            let text = RichMessageAttributedText.make(
                segments: [.text("A multiline reply with **literal** symbols, العربية and 日本語. " + String(repeating: "More words. ", count: 20))],
                textStyle: .body,
                dynamicTypeSize: size,
                legibilityWeight: .bold
            )
            view.attributedText = text
            reference.attributedText = text
            for width in [320.0, 140.0, 320.0, 240.0, 140.0] {
                let proposal = CGSize(width: width, height: CGFloat.greatestFiniteMagnitude)
                view.frame.size.width = width
                reference.frame.size.width = width
                XCTAssertEqual(view.sizeThatFits(proposal), reference.sizeThatFits(proposal))
            }
        }
    }

    func testAvatarDecodePerformance() async throws {
        let bytes = avatarBytes()
        var elapsed: [Double] = []
        for index in 0..<10 {
            let cache = AvatarImageCache()
            let url = try XCTUnwrap(URL(string: "https://example.com/performance-avatar-\(index).png"))
            let start = ContinuousClock.now
            let image = await cache.load(url: url) { _ in bytes }
            let duration = start.duration(to: .now).components
            elapsed.append(Double(duration.seconds) * 1000 + Double(duration.attoseconds) / 1e15)
            XCTAssertNotNil(image)
        }
        print("AVATAR_DECODE_MS \(elapsed)")
    }

    private func makeTextView() -> RichMessageUITextView {
        let storage = NSTextStorage()
        let layout = RichReferenceLayoutManager()
        let container = NSTextContainer(size: CGSize(width: 0, height: CGFloat.greatestFiniteMagnitude))
        container.lineFragmentPadding = 0
        layout.addTextContainer(container)
        storage.addLayoutManager(layout)
        let view = RichMessageUITextView(frame: .zero, textContainer: container)
        view.isScrollEnabled = false
        view.textContainerInset = .zero
        layout.claimLineBreaking()
        view.attributedText = RichMessageAttributedText.make(
            segments: [.text(String(repeating: "A short agent reply with enough words to wrap across several lines. ", count: 12))],
            textStyle: .body,
            dynamicTypeSize: .large,
            legibilityWeight: nil
        )
        return view
    }

    private func avatarBytes() -> Data {
        UIGraphicsImageRenderer(size: CGSize(width: 1024, height: 1024), format: {
            let format = UIGraphicsImageRendererFormat()
            format.scale = 1
            return format
        }()).pngData { context in
            UIColor.systemBlue.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024))
        }
    }
}
