import Foundation
import XCTest
@testable import HausModels

/// Mirrors the App's `reminder-schedule-presentation.test.ts`.
final class ReminderSchedulePresentationTests: XCTestCase {
    // Thursday, Oct 8 2026, noon in New York.
    private let now = iso("2026-10-08T16:00:00.000Z")

    private func context(_ viewer: String = "America/New_York") -> ReminderScheduleContext {
        ReminderScheduleContext(locale: Locale(identifier: "en_US"), now: now, viewerZone: TimeZone(identifier: viewer)!)
    }

    private func row(_ fireAt: String = "2026-10-10T20:00:00.000Z", repeat rule: String? = nil, zone: String = "UTC") -> String {
        plain(ReminderSchedulePresentation.rowSummary(fireAt: iso(fireAt), repeatRule: rule, timezone: zone, context: context()))
    }

    private func detail(_ fireAt: String, repeat rule: String? = nil, zone: String, viewer: String = "America/New_York") -> ReminderScheduleDetail {
        let detail = ReminderSchedulePresentation.detail(fireAt: iso(fireAt), repeatRule: rule, timezone: zone, context: context(viewer))
        return ReminderScheduleDetail(nextRun: plain(detail.nextRun), repeats: plain(detail.repeats), timezone: plain(detail.timezone))
    }

    func testTheKindIsOneOfTwoAndSaysSo() {
        XCTAssertEqual(ReminderKind(repeatRule: nil).label, "One-time reminder")
        XCTAssertEqual(ReminderKind(repeatRule: "daily@09:00").label, "Recurring reminder")
    }

    func testOneTimeRowLeadsWithOnceInViewerTimeWithoutZoneText() {
        XCTAssertEqual(row(), "Once · Sat, Oct 10 at 4:00 PM")
        XCTAssertFalse(row().contains("UTC"))
    }

    func testNearRunUsesRelativeDayWords() {
        XCTAssertEqual(row("2026-10-08T21:30:00.000Z"), "Once · Today at 5:30 PM")
        XCTAssertEqual(row("2026-10-09T13:00:00.000Z"), "Once · Tomorrow at 9:00 AM")
        // A wake still waiting on an offline Agent.
        XCTAssertEqual(row("2026-10-07T13:00:00.000Z"), "Once · Yesterday at 9:00 AM")
    }

    func testRunInAnotherYearNamesTheYear() {
        XCTAssertEqual(row("2027-01-04T15:00:00.000Z"), "Once · Mon, Jan 4, 2027 at 10:00 AM")
    }

    func testRecurringRowLeadsWithCadenceAndNamesTheNextRunByDay() {
        XCTAssertEqual(
            row("2026-10-12T19:57:00.000Z", repeat: "weekly:mon@19:57"),
            "Every Monday at 3:57 PM · Next run Mon, Oct 12"
        )
        XCTAssertEqual(
            row("2026-10-09T13:00:00.000Z", repeat: "daily@09:00", zone: "America/New_York"),
            "Daily at 9:00 AM · Next run tomorrow"
        )
    }

    func testRecurringRowAddsTheNextClockOnlyWhenTheCadenceDoesNotSayIt() {
        XCTAssertEqual(
            row("2026-10-08T21:30:00.000Z", repeat: "every:30m"),
            "Every 30 minutes · Next run today at 5:30 PM"
        )
        // An off-slot first fire keeps the Server's actual instant.
        XCTAssertEqual(
            row("2026-10-12T19:57:00.000Z", repeat: "weekly:mon@15:57"),
            "Every Monday at 11:57 AM · Next run Mon, Oct 12 at 3:57 PM"
        )
    }

    func testDetailCarriesTheScheduleZoneAndItsClockThereWhenItDiffers() {
        XCTAssertEqual(
            detail("2026-10-10T20:00:00.000Z", zone: "UTC"),
            ReminderScheduleDetail(nextRun: "Sat, Oct 10, 2026 at 4:00 PM", repeats: "Doesn't repeat", timezone: "UTC · 8:00 PM there")
        )
        XCTAssertEqual(
            detail("2026-10-09T13:00:00.000Z", repeat: "daily@09:00", zone: "America/New_York"),
            ReminderScheduleDetail(nextRun: "Fri, Oct 9, 2026 at 9:00 AM", repeats: "Daily at 9:00 AM", timezone: "New York time · Same as yours")
        )
    }

    func testDetailNamesTheWeekdayThereWhenTheScheduleZoneIsOnAnotherDay() {
        let result = detail("2026-10-10T01:00:00.000Z", repeat: "weekly:fri@21:00", zone: "America/New_York", viewer: "Asia/Tokyo")
        XCTAssertEqual(result.repeats, "Every Saturday at 10:00 AM")
        XCTAssertEqual(result.nextRun, "Sat, Oct 10, 2026 at 10:00 AM")
        XCTAssertEqual(result.timezone, "New York time · Fri 9:00 PM there")
    }

    func testUnrecognizedStoredZoneIsNamedRatherThanSilentlyReplaced() {
        let result = detail("2026-10-10T20:00:00.000Z", zone: "Invalid/Zone")
        XCTAssertEqual(result.timezone, "Invalid/Zone · Unrecognized timezone")
        XCTAssertEqual(result.nextRun, "Sat, Oct 10, 2026 at 4:00 PM")
    }

    func testInstructionsAreSaidOnceWhenTheyRepeatTheTitle() {
        let base = Reminder(anchorChatID: "c", createdAt: now, description: "Standup", fireAt: now, id: "r", ownerAgentID: "a", timezone: "UTC", title: "Standup")
        XCTAssertNil(base.instructions)
        let distinct = Reminder(anchorChatID: "c", createdAt: now, description: " Ask for blockers. ", fireAt: now, id: "r", ownerAgentID: "a", timezone: "UTC", title: "Standup")
        XCTAssertEqual(distinct.instructions, "Ask for blockers.")
    }

    func testTheSavedZoneNotTheDeviceZoneDrivesRowDetailAndSameAsYours() {
        // Kolkata is a half-hour zone no test machine is assumed to run in.
        let fireAt = "2026-10-09T03:30:00.000Z"
        let summary = ReminderSchedulePresentation.rowSummary(
            fireAt: iso(fireAt), repeatRule: "daily@09:00", timezone: "Asia/Kolkata", context: context("Asia/Kolkata")
        )
        XCTAssertEqual(plain(summary), "Daily at 9:00 AM · Next run tomorrow")
        XCTAssertEqual(
            detail(fireAt, repeat: "daily@09:00", zone: "Asia/Kolkata", viewer: "Asia/Kolkata"),
            ReminderScheduleDetail(nextRun: "Fri, Oct 9, 2026 at 9:00 AM", repeats: "Daily at 9:00 AM", timezone: "Kolkata time · Same as yours")
        )
        XCTAssertEqual(
            detail(fireAt, repeat: "daily@09:00", zone: "Asia/Kolkata").timezone,
            "Kolkata time · Fri 9:00 AM there"
        )
    }
}
