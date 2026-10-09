import Foundation
@testable import HausUI
import Testing

/// Case for case, `apps/website/src/features/mentions/time-chip-format.test.ts`:
/// a chip and its details read the same words on both clients.
struct TimeReferenceTests {
    private static let now = instant("2026-10-08T16:00:00Z")
    private static let eastern = TimeZone(identifier: "America/New_York")!

    private static func instant(_ value: String) -> Date {
        ISO8601DateFormatter().date(from: value)!
    }

    private static func label(_ value: String, end: String? = nil, zone: TimeZone = eastern) -> String {
        TimeReference.chipLabel(instant(value), end: end.map(instant), zone: zone, now: now)
    }

    // MARK: Chip label

    @Test func usesDayWordsForTodayAndTomorrowInTheViewerZone() {
        #expect(Self.label("2026-10-08T19:00:00Z") == "Today at 3:00 PM EDT")
        #expect(Self.label("2026-10-09T13:00:00Z") == "Tomorrow at 9:00 AM EDT")
        #expect(Self.label("2026-10-07T13:00:00Z") == "Yesterday at 9:00 AM EDT")
    }

    @Test func namesTheDateFurtherOutWithTheYearOnlyOutsideThisYear() {
        #expect(Self.label("2026-10-10T07:00:00Z") == "Sat, Oct 10 at 3:00 AM EDT")
        #expect(Self.label("2027-01-15T15:00:00Z") == "Fri, Jan 15, 2027 at 10:00 AM EST")
    }

    @Test func readsTheSameInstantInAnotherViewerZone() {
        #expect(
            Self.label("2026-10-10T07:00:00Z", zone: TimeZone(identifier: "America/Los_Angeles")!)
                == "Sat, Oct 10 at 12:00 AM PDT"
        )
    }

    // MARK: Zone rows

    @Test func listsTheViewerZoneFirstThenPacificEasternAndUTC() {
        let rows = TimeReference.zoneLines(
            Self.instant("2026-10-10T07:00:00Z"),
            viewerZone: TimeZone(identifier: "Europe/Berlin")!,
            now: Self.now
        )
        #expect(rows.map(\.title) == ["Your time · Berlin", "Pacific", "Eastern", "UTC"])
        #expect(rows[0].text == "Saturday, October 10 at 9:00 AM GMT+2")
        #expect(rows[2].text == "Saturday, October 10 at 3:00 AM EDT")
    }

    @Test func dropsTheReferenceRowTheViewerAlreadyLivesIn() {
        let instant = Self.instant("2026-10-10T07:00:00Z")
        #expect(
            TimeReference.zoneLines(instant, viewerZone: Self.eastern, now: Self.now).map(\.title)
                == ["Your time · New York", "Pacific", "UTC"]
        )
        #expect(
            TimeReference.zoneLines(instant, viewerZone: TimeZone(identifier: "Etc/UTC")!, now: Self.now).count == 3
        )
    }

    @Test func addsTheYearOutsideThisYear() {
        let rows = TimeReference.zoneLines(Self.instant("2027-01-15T15:00:00Z"), viewerZone: Self.eastern, now: Self.now)
        #expect(rows[0].text == "Friday, January 15, 2027 at 10:00 AM EST")
    }

    // MARK: Distance

    @Test func relativeDistanceCountsHoursWithinADayThenCalendarDays() {
        let from = { (value: String) in TimeReference.fromNow(Self.instant(value), zone: Self.eastern, now: Self.now) }
        #expect(from("2026-10-10T16:00:00Z") == "in 2 days")
        // 39 hours away, but Saturday is two calendar days from Thursday.
        #expect(from("2026-10-10T07:00:00Z") == "in 2 days")
        #expect(from("2026-10-08T19:30:00Z") == "in 4 hours")
        #expect(from("2026-10-08T13:00:00Z") == "3 hours ago")
        #expect(from("2026-10-08T16:00:20Z") == "now")
    }

    // MARK: Ranges

    @Test func aRangeReadsBothEndsInOneLabel() {
        #expect(Self.label("2026-10-08T14:00:00Z", end: "2026-10-08T15:00:00Z") == "Today at 10:00 – 11:00 AM EDT")
        #expect(
            Self.label("2026-10-09T02:00:00Z", end: "2026-10-09T05:00:00Z")
                == "Today at 10:00 PM EDT – Tomorrow at 1:00 AM EDT"
        )
        let rows = TimeReference.zoneLines(
            Self.instant("2026-10-08T14:00:00Z"),
            end: Self.instant("2026-10-08T15:00:00Z"),
            viewerZone: Self.eastern,
            now: Self.now
        )
        #expect(rows[0].text == "Thursday, October 8 at 10:00 AM EDT – 11:00 AM EDT")
    }

    // MARK: Swift-only

    @Test func aRangeAcrossNoonWritesBothMeridiems() {
        #expect(Self.label("2026-10-08T15:00:00Z", end: "2026-10-08T17:00:00Z") == "Today at 11:00 AM – 1:00 PM EDT")
    }

    @Test func readsUTCAsUTC() {
        #expect(Self.label("2026-10-08T19:00:00Z", zone: TimeZone(identifier: "UTC")!) == "Today at 7:00 PM UTC")
    }

    @Test func chipIDRoundTripsTheMomentAndEscapesItsColons() throws {
        let start = Self.instant("2026-10-09T14:00:00Z")
        let end = Self.instant("2026-10-09T15:00:00Z")
        let id = TimeReference.id(startsAt: start, endsAt: end)
        #expect(id == "2026-10-09T14:00:00.000Z/2026-10-09T15:00:00.000Z")
        let span = try #require(TimeReference.span(id))
        #expect(span.startsAt == start && span.endsAt == end)
        #expect(TimeReference.span("tomorrow") == nil)
        #expect(TimeReference.activationURL(for: id)?.scheme == "time")
    }

    @Test func dayStampMovesWithTheZoneAndTheDay() {
        let morning = Self.instant("2026-10-08T12:00:00Z")
        let evening = Self.instant("2026-10-08T23:00:00Z")
        let tokyo = TimeZone(identifier: "Asia/Tokyo")!
        #expect(
            TimeReference.dayStamp(zone: Self.eastern, now: morning)
                == TimeReference.dayStamp(zone: Self.eastern, now: evening)
        )
        #expect(TimeReference.dayStamp(zone: tokyo, now: morning) != TimeReference.dayStamp(zone: tokyo, now: evening))
    }
}
