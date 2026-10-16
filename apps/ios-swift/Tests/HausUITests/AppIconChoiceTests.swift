@testable import HausUI
import XCTest

/// The picker reads the system's alternate icon name back into a choice, so
/// the mapping has to round-trip and must never land on a choice that names
/// an icon the bundle does not carry.
final class AppIconChoiceTests: XCTestCase {
    func testGhostIsThePrimaryIcon() {
        XCTAssertNil(AppIconChoice.ghost.alternateIconName)
        XCTAssertEqual(AppIconChoice(alternateIconName: nil), .ghost)
    }

    func testPumpkinIsTheHalloweenAlternate() {
        XCTAssertEqual(AppIconChoice.pumpkin.alternateIconName, "halloween-icon")
        XCTAssertEqual(AppIconChoice(alternateIconName: "halloween-icon"), .pumpkin)
    }

    func testEveryChoiceRoundTrips() {
        for choice in AppIconChoice.allCases {
            XCTAssertEqual(AppIconChoice(alternateIconName: choice.alternateIconName), choice)
        }
    }

    func testUnknownAlternateReadsAsTheGhost() {
        XCTAssertEqual(AppIconChoice(alternateIconName: "retired-icon"), .ghost)
    }

    func testTitlesAreShort() {
        XCTAssertEqual(AppIconChoice.allCases.map(\.title), ["Ghost", "Pumpkin"])
    }
}
