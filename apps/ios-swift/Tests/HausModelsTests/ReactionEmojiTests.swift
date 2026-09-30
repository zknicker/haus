import XCTest
@testable import HausModels

/// Mirrors `packages/haus-api/src/reaction-emoji.test.ts`.
final class ReactionEmojiTests: XCTestCase {
    func testSingleEmojiGraphemesAreAcceptedFullyQualified() {
        for emoji in ["😂", "🎉", "👍", "🙏", "✅", "🫡", "👍🏽", "🇺🇸", "👩‍💻", "🏳️‍🌈", "🦖"] {
            XCTAssertEqual(ReactionEmoji.normalized(emoji), emoji, emoji)
        }
    }

    func testSelectorsAndWhitespaceNormalize() {
        XCTAssertEqual(ReactionEmoji.normalized("\u{2764}"), "\u{2764}\u{FE0F}")
        XCTAssertEqual(ReactionEmoji.normalized(" \u{2764}\u{FE0F} "), "\u{2764}\u{FE0F}")
        XCTAssertEqual(ReactionEmoji.normalized("\u{2764}\u{FE0E}"), "\u{2764}\u{FE0F}")
        XCTAssertEqual(ReactionEmoji.normalized("\u{261D}\u{1F3FD}"), "\u{261D}\u{1F3FD}")
        XCTAssertEqual(ReactionEmoji.normalized("\u{1F3F3}\u{200D}\u{1F308}"), "\u{1F3F3}\u{FE0F}\u{200D}\u{1F308}")
        XCTAssertEqual(ReactionEmoji.normalized("#\u{20E3}"), "#\u{FE0F}\u{20E3}")
    }

    func testTextSeveralEmojiAndBareDigitsAreRefused() {
        for input in ["", "ok", "thanks 👍", "👍👍", "😂😂", "1", "#", "a\u{20E3}", ":heart:"] {
            XCTAssertNil(ReactionEmoji.normalized(input), input)
        }
    }
}
