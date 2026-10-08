import XCTest
@testable import HausUI

/// Chat details renders a channel's "About" section only for a real
/// description, so the presentation never carries a blank one.
final class ChatPresentationDescriptionTests: XCTestCase {
    func testKeepsATrimmedDescription() {
        XCTAssertEqual(channel(description: "  Launch planning.\n").description, "Launch planning.")
    }

    func testBlankDescriptionIsNil() {
        XCTAssertNil(channel(description: "   \n").description)
    }

    func testMissingDescriptionIsNil() {
        XCTAssertNil(channel(description: nil).description)
    }

    private func channel(description: String?) -> ChatPresentation {
        ChatPresentation(id: "chat_1", title: "launches", kind: .channel, description: description)
    }
}
