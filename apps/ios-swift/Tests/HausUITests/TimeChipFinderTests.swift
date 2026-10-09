import Foundation
@testable import HausUI
import Testing

/// Case for case, `packages/haus-api/src/time-chips.test.ts`: same inputs, same
/// expected spans and instants. A row added there belongs here too, so the two
/// grammars cannot drift apart unnoticed.
struct TimeChipFinderTests {
    // Friday, October 9, 2026 at 12:00 PM EDT.
    private static let sentAt = iso("2026-10-09T16:00:00.000Z")

    @Test(arguments: [
        ("Call at 3 PM ET.", "3 PM ET", "2026-10-09T19:00:00.000Z"),
        ("Call at 3:00 PM EDT", "3:00 PM EDT", "2026-10-09T19:00:00.000Z"),
        ("Deploy 15:00 UTC", "15:00 UTC", "2026-10-09T15:00:00.000Z"),
        ("Deploy 15:00 GMT", "15:00 GMT", "2026-10-09T15:00:00.000Z"),
        ("Sync 9am Pacific", "9am Pacific", "2026-10-09T16:00:00.000Z"),
        ("Sync 9:30 am Eastern Time", "9:30 am Eastern Time", "2026-10-09T13:30:00.000Z"),
        ("Sat, Oct 10 at 3 PM ET", "Sat, Oct 10 at 3 PM ET", "2026-10-10T19:00:00.000Z"),
        ("on Oct 10, 2026 at 3 PM ET", "Oct 10, 2026 at 3 PM ET", "2026-10-10T19:00:00.000Z"),
        ("tomorrow at 3 PM ET", "tomorrow at 3 PM ET", "2026-10-10T19:00:00.000Z"),
        ("Tomorrow 3 PM ET", "Tomorrow 3 PM ET", "2026-10-10T19:00:00.000Z"),
        ("yesterday at 3 PM ET", "yesterday at 3 PM ET", "2026-10-08T19:00:00.000Z"),
        ("tonight at 9 p.m. MT", "tonight at 9 p.m. MT", "2026-10-10T03:00:00.000Z"),
        ("at 3 PM ET tomorrow", "3 PM ET tomorrow", "2026-10-10T19:00:00.000Z"),
        ("at 3 PM ET on Monday", "3 PM ET on Monday", "2026-10-12T19:00:00.000Z"),
        ("Monday at 9am CT", "Monday at 9am CT", "2026-10-12T14:00:00.000Z"),
        ("Friday at 9am CT", "Friday at 9am CT", "2026-10-09T14:00:00.000Z"),
        ("2026-12-01 9:30 AM PT", "2026-12-01 9:30 AM PT", "2026-12-01T17:30:00.000Z"),
    ])
    func chips(text: String, source: String, startsAt: String) {
        let chips = TimeChipFinder.find(in: text, sentAt: Self.sentAt).map { Self.wire($0, in: text) }
        let start = Self.utf16Offset(of: source, in: text)
        #expect(chips == [Wire(start: start, end: start + source.utf16.count, text: source, startsAt: startsAt)])
    }

    @Test(arguments: [
        ("10–11 AM ET", "2026-10-09T14:00:00.000Z", "2026-10-09T15:00:00.000Z"),
        ("10 AM - 11:30 AM ET", "2026-10-09T14:00:00.000Z", "2026-10-09T15:30:00.000Z"),
        ("11–1 PM ET", "2026-10-09T15:00:00.000Z", "2026-10-09T17:00:00.000Z"),
        ("12 to 1 PM ET", "2026-10-09T16:00:00.000Z", "2026-10-09T17:00:00.000Z"),
        ("10 PM–1 AM PT", "2026-10-10T05:00:00.000Z", "2026-10-10T08:00:00.000Z"),
        ("14:00–15:00 UTC", "2026-10-09T14:00:00.000Z", "2026-10-09T15:00:00.000Z"),
    ])
    func rangeIsOneChip(text: String, startsAt: String, endsAt: String) {
        let chips = TimeChipFinder.find(in: text, sentAt: Self.sentAt).map { Self.wire($0, in: text) }
        #expect(chips == [Wire(start: 0, end: text.utf16.count, text: text, startsAt: startsAt, endsAt: endsAt)])
    }

    @Test func usAbbreviationsMeanTheRegionWallClockAcrossDST() {
        let at = { (text: String) in Self.firstStart(text, sentAt: Self.sentAt) }
        // CST is US Central, not China; in October Chicago is on CDT.
        #expect(at("3 PM CST") == "2026-10-09T20:00:00.000Z")
        #expect(at("3 PM PST") == at("3 PM PDT"))
        // US DST ends November 1, 2026 and starts March 14, 2027.
        #expect(at("Oct 31 at 9 AM ET") == "2026-10-31T13:00:00.000Z")
        #expect(at("Nov 2 at 9 AM ET") == "2026-11-02T14:00:00.000Z")
        #expect(at("Mar 12 at 9 AM ET") == "2027-03-12T14:00:00.000Z")
        #expect(at("Mar 15 at 9 AM ET") == "2027-03-15T13:00:00.000Z")
    }

    @Test func aMonthDayWithoutAYearIsTheNearestOneAheadOfAStaleDate() {
        #expect(Self.firstStart("Jan 5 at 9 AM PT", sentAt: Self.sentAt) == "2027-01-05T17:00:00.000Z")
        #expect(Self.firstStart("Sep 30 at 9 AM PT", sentAt: Self.sentAt) == "2026-09-30T16:00:00.000Z")
    }

    @Test func relativeDaysResolveInTheStatedZoneNotUTC() {
        // Friday 10:00 PM EDT, already Saturday in UTC.
        let late = Self.iso("2026-10-10T02:00:00.000Z")
        #expect(Self.firstStart("tomorrow at 9 AM ET", sentAt: late) == "2026-10-10T13:00:00.000Z")
        #expect(Self.firstStart("tomorrow at 09:00 UTC", sentAt: late) == "2026-10-11T09:00:00.000Z")
    }

    @Test func findsSeveralChipsInOneMessage() {
        let chips = TimeChipFinder.find(in: "Standup 9am PT, retro 3 PM ET, deploy 22:00 UTC.", sentAt: Self.sentAt)
        #expect(chips.map(\.text) == ["9am PT", "3 PM ET", "22:00 UTC"])
    }

    @Test(arguments: [
        "tomorrow",
        "Friday ET",
        "tomorrow morning ET",
        "in 3 hours",
        "at 3 PM",
        "at 3 ET",
        "at 13 PM ET",
        "at 25:00 UTC",
        "at 10:30:00 UTC",
        "the ETA is 3 PM",
        "at 3 PM ETA",
        "Feb 30 at 3 PM ET",
        "v2.10 PT",
    ])
    func isPlainText(text: String) {
        #expect(TimeChipFinder.find(in: text, sentAt: Self.sentAt).isEmpty)
    }

    // MARK: Swift-only: index space

    /// The App reports UTF-16 offsets; Swift ranges must land on the same code
    /// units after astral characters, or the chip would cut a character apart.
    @Test func rangesSurviveAstralCharacters() {
        let text = "🚀🧑‍💻 ship at 3 PM ET 🎉"
        let chip = TimeChipFinder.find(in: text, sentAt: Self.sentAt)
        #expect(chip.map(\.text) == ["3 PM ET"])
        #expect(chip.first.map { String(text[$0.range]) } == "3 PM ET")
        #expect(chip.first.map { Self.wire($0, in: text) }?.start == Self.utf16Offset(of: "3 PM ET", in: text))
    }

    // MARK: Helpers

    private struct Wire: Equatable {
        var start: Int
        var end: Int
        var text: String
        var startsAt: String
        var endsAt: String?
    }

    private static func wire(_ chip: TimeChipMatch, in text: String) -> Wire {
        Wire(
            start: chip.range.lowerBound.utf16Offset(in: text),
            end: chip.range.upperBound.utf16Offset(in: text),
            text: chip.text,
            startsAt: isoString(chip.startsAt),
            endsAt: chip.endsAt.map(isoString)
        )
    }

    private static func firstStart(_ text: String, sentAt: Date) -> String? {
        TimeChipFinder.find(in: text, sentAt: sentAt).first.map { isoString($0.startsAt) }
    }

    private static func utf16Offset(of source: String, in text: String) -> Int {
        text.range(of: source).map { $0.lowerBound.utf16Offset(in: text) } ?? -1
    }

    /// `Date.prototype.toISOString`: milliseconds, always UTC.
    private static func isoString(_ date: Date) -> String {
        isoFormatter.string(from: date)
    }

    private static func iso(_ value: String) -> Date {
        isoFormatter.date(from: value)!
    }

    private nonisolated(unsafe) static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
