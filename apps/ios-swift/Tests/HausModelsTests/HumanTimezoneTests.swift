import XCTest
@testable import HausModels

final class HumanTimezoneTests: XCTestCase {
    func testReportsAnIANADeviceZone() {
        XCTAssertEqual(HumanTimezone.deviceZone("America/New_York"), "America/New_York")
        XCTAssertEqual(HumanTimezone.deviceZone("UTC"), "UTC")
        XCTAssertEqual(HumanTimezone.deviceZone("America/Argentina/Buenos_Aires"), "America/Argentina/Buenos_Aires")
    }

    /// The Server refuses offsets and unknown names, and a refused zone would
    /// fail the whole identity sync, so the phone leaves them out.
    func testSkipsZonesTheServerWouldRefuse() {
        XCTAssertNil(HumanTimezone.deviceZone("GMT+0500"))
        XCTAssertNil(HumanTimezone.deviceZone("+05:00"))
        XCTAssertNil(HumanTimezone.deviceZone("Etc/Unknown/Nowhere"))
        XCTAssertNil(HumanTimezone.deviceZone(""))
    }

    func testOptionsIncludeUTCAndTheCurrentValueSorted() {
        let options = HumanTimezone.options(current: "America/New_York")
        XCTAssertTrue(options.contains("UTC"))
        XCTAssertTrue(options.contains("America/New_York"))
        XCTAssertEqual(options, options.sorted())
        XCTAssertFalse(options.contains { !HumanTimezone.isAcceptable($0) && $0 != "America/New_York" })
    }

    func testSearchMatchesPlaceNamesWithSpacesOrUnderscores() {
        XCTAssertEqual(HumanTimezone.label("America/New_York"), "America/New York")
        XCTAssertTrue(HumanTimezone.matches("America/New_York", query: "new york"))
        XCTAssertTrue(HumanTimezone.matches("America/New_York", query: "New_York"))
        XCTAssertTrue(HumanTimezone.matches("America/New_York", query: ""))
        XCTAssertFalse(HumanTimezone.matches("America/New_York", query: "tokyo"))
    }

    func testViewerReadsInTheSavedZoneAndTheDeviceZoneOnlyFillsABlank() {
        let device = TimeZone(identifier: "America/Los_Angeles")!
        XCTAssertEqual(HumanTimezone.viewerZone(saved: "Asia/Kolkata", device: device).identifier, "Asia/Kolkata")
        XCTAssertEqual(HumanTimezone.viewerZone(saved: nil, device: device), device)
        XCTAssertEqual(HumanTimezone.viewerZone(saved: "Invalid/Zone", device: device), device)
    }
}
