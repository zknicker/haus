import Foundation
import XCTest
@testable import HausModels

/// Mirrors the App's `reminder-cadence.test.ts`.
final class ReminderCadenceTests: XCTestCase {
    private let enUS = Locale(identifier: "en_US")
    private let newYorkFire = iso("2026-10-09T13:00:00.000Z")

    private func phrase(_ rule: String, fireAt: Date? = nil, zone: String = "America/New_York", viewer: String) -> String {
        plain(ReminderCadence.viewerPhrase(
            rule,
            fireAt: fireAt ?? newYorkFire,
            scheduleZone: zone,
            viewerZone: TimeZone(identifier: viewer)!,
            locale: enUS
        ))
    }

    func testCalendarSlotReadsInTheViewerZoneKeepingTheClockForASameZoneViewer() {
        XCTAssertEqual(phrase("weekly:fri@09:00", viewer: "America/New_York"), "Every Friday at 9:00 AM")
        XCTAssertEqual(phrase("daily@09:00", viewer: "America/Los_Angeles"), "Daily at 6:00 AM")
    }

    func testSlotOnAnotherCalendarDayForTheViewerMovesItsWeekdays() {
        let evening = iso("2026-10-10T01:00:00.000Z")
        XCTAssertEqual(phrase("weekly:fri@21:00", fireAt: evening, viewer: "Asia/Tokyo"), "Every Saturday at 10:00 AM")
        XCTAssertEqual(phrase("weekly:sat,mon@21:00", fireAt: evening, viewer: "Asia/Tokyo"), "Every Sun and Tue at 10:00 AM")
    }

    func testDSTIsResolvedOnTheDateOfTheNextFire() {
        for (fireAt, local) in [
            ("2026-03-02T14:00:00.000Z", "2:00 PM"),
            ("2026-03-09T13:00:00.000Z", "1:00 PM"),
            ("2026-10-26T13:00:00.000Z", "1:00 PM"),
            ("2026-11-02T14:00:00.000Z", "2:00 PM"),
        ] {
            XCTAssertEqual(
                phrase("weekly:mon@09:00", fireAt: iso(fireAt), viewer: "Europe/London"),
                "Every Monday at \(local)"
            )
        }
    }

    func testMultipleWeekdaysUseCalendarOrder() {
        XCTAssertEqual(phrase("weekly:fri,mon,wed@09:00", viewer: "America/New_York"), "Every Mon, Wed, and Fri at 9:00 AM")
    }

    func testFixedIntervalsNeverImplyAWallClockAppointment() {
        XCTAssertEqual(phrase("every:24h", viewer: "Asia/Tokyo"), "Every 24 hours")
        XCTAssertEqual(ReminderCadence("every:1d"), .interval(label: "Every 1 day"))
        XCTAssertEqual(ReminderCadence("every:15m"), .interval(label: "Every 15 minutes"))
    }

    func testUnknownScheduleZoneLeavesTheSlotAsWritten() {
        XCTAssertEqual(phrase("daily@09:00", zone: "Invalid/Zone", viewer: "Asia/Tokyo"), "Daily at 9:00 AM")
    }

    func testUnrecognizedGrammarRemainsReadableWithoutInventingASchedule() {
        for rule in ["custom:future", "weekly:nope@09:00", "daily@25:00", "every:0m"] {
            XCTAssertEqual(phrase(rule, zone: "America/New_York", viewer: "UTC"), rule)
            XCTAssertEqual(ReminderCadence(rule), .unknown(rule))
        }
    }
}

/// Foundation separates a clock from its day period with a narrow no-break
/// space; the App's tests are written with a plain one.
func plain(_ value: String) -> String {
    value.replacingOccurrences(of: "\u{202F}", with: " ")
}

func iso(_ value: String) -> Date {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.date(from: value)!
}
