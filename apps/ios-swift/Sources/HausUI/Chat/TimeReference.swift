import Foundation

/// A time chip's moment and how each viewer reads it.
///
/// Chips are found in prose (`TimeChipFinder`); the stored text never changes.
/// A chip's reference id is its UTC instant, or `<start>/<end>` for a range
/// (ISO 8601 interval form). Every viewer reads the moment in their own saved
/// zone (ADR 0040), worded exactly as the App's `time-chip-format.ts` words it.
public enum TimeReference {
    public static let scheme = "time"

    /// The reference id for a chip's moment.
    public static func id(startsAt: Date, endsAt: Date?) -> String {
        [startsAt, endsAt].compactMap { $0.map(isoFormatter.string(from:)) }.joined(separator: "/")
    }

    /// The moment a chip's id names, or nil when it names none.
    public static func span(_ id: String) -> (startsAt: Date, endsAt: Date?)? {
        let parts = id.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        guard (1...2).contains(parts.count), let start = isoFormatter.date(from: parts[0]) else { return nil }
        guard parts.count == 2 else { return (start, nil) }
        guard let end = isoFormatter.date(from: parts[1]) else { return nil }
        return (start, end)
    }

    /// The address a time chip's link carries. Only the scheme is read back
    /// (the chip's own run holds the moment); the colons are escaped because
    /// an authority would read them as a port and refuse the URL.
    public static func activationURL(for id: String) -> URL? {
        URL(string: "\(scheme)://\(id.replacingOccurrences(of: ":", with: "%3A"))")
    }

    /// "Today at 3:00 PM EDT", "Tomorrow at 9:00 AM EDT", "Sat, Oct 10 at 3:00 AM EDT",
    /// "Fri, Jan 15, 2027 at 10:00 AM EST", or a range "Today at 10:00 – 11:00 AM EDT".
    public static func chipLabel(_ instant: Date, end: Date? = nil, zone: TimeZone, now: Date = Date()) -> String {
        let fireDay = dayKey(instant, zone)
        let today = dayKey(now, zone)
        let offset = daysBetween(today, fireDay)
        let day: String = switch offset {
        case -1: "Yesterday"
        case 0: "Today"
        case 1: "Tomorrow"
        default: format(
            instant,
            fireDay.prefix(4) == today.prefix(4) ? "EEE, MMM d" : "EEE, MMM d, yyyy",
            zone: zone
        )
        }
        guard let end else { return "\(day) at \(clock(instant, zone: zone))" }
        return dayKey(end, zone) == fireDay
            ? "\(day) at \(clockRange(instant, end, zone: zone))"
            : "\(day) at \(clock(instant, zone: zone)) – \(chipLabel(end, zone: zone, now: now))"
    }

    /// One row of a tapped chip's details: whose zone it is and the moment there.
    public struct ZoneLine: Hashable, Sendable {
        /// "Your time · New York", "Pacific", "Eastern", "UTC".
        public let title: String
        /// "Friday, October 10 at 3:00 AM EDT".
        public let text: String
    }

    /// The viewer's own zone first, then Pacific, Eastern, and UTC, skipping
    /// whichever of those the viewer already lives in.
    public static func zoneLines(_ instant: Date, end: Date? = nil, viewerZone: TimeZone, now: Date = Date()) -> [ZoneLine] {
        let viewerKey = zoneKey(viewerZone.identifier)
        let thisYear = dayKey(now, viewerZone).prefix(4)
        let references = referenceZones.filter { zoneKey($0.identifier) != viewerKey }
        let rows = [("Your time · \(zoneName(viewerKey))", viewerZone)]
            + references.compactMap { identifier, title in TimeZone(identifier: identifier).map { (title, $0) } }
        return rows.map { title, zone in
            let withYear = dayKey(instant, zone).prefix(4) != thisYear
            let day = format(instant, withYear ? "EEEE, MMMM d, yyyy" : "EEEE, MMMM d", zone: zone)
            let range = end.map { " – \(clock($0, zone: zone))" } ?? ""
            return ZoneLine(title: title, text: "\(day) at \(clock(instant, zone: zone))\(range)")
        }
    }

    /// "in 3 hours", "in 2 days", "5 days ago": how far the moment is from now.
    /// Past a day it counts calendar days in the viewer zone, as the App does.
    public static func fromNow(_ instant: Date, zone: TimeZone, now: Date = Date()) -> String {
        let seconds = instant.timeIntervalSince(now)
        if abs(seconds) < 60 { return "now" }
        if abs(seconds) < 3600 { return relative(Int((seconds / 60).rounded()), "minute") }
        if abs(seconds) < 86_400 { return relative(Int((seconds / 3600).rounded()), "hour") }
        let days = daysBetween(dayKey(now, zone), dayKey(instant, zone))
        if abs(days) < 30 { return relative(days, "day") }
        return abs(days) < 365
            ? relative(Int((Double(days) / 30).rounded()), "month")
            : relative(Int((Double(days) / 365).rounded()), "year")
    }

    /// The viewer's zone and day, which is everything a chip label depends on
    /// besides the moment itself: a body worded under another stamp is read
    /// again, or "Today" outlives the day it named.
    public static func dayStamp(zone: TimeZone, now: Date = Date()) -> String {
        "\(zone.identifier) \(dayKey(now, zone))"
    }

    // MARK: Helpers

    private static let referenceZones: [(identifier: String, title: String)] = [
        ("America/Los_Angeles", "Pacific"),
        ("America/New_York", "Eastern"),
        ("UTC", "UTC"),
    ]

    /// The App's `(?:Etc/)?(?:UTC|UCT|GMT0?|Universal|Zulu|Greenwich)`: one zone.
    private static let utcAliases: Set<String> = Set(
        ["UTC", "UCT", "GMT", "GMT0", "Universal", "Zulu", "Greenwich"].flatMap { [$0, "Etc/\($0)"] }
    )

    private static func zoneKey(_ identifier: String) -> String {
        utcAliases.contains(identifier) ? "UTC" : identifier
    }

    /// "America/New_York" reads as "New York"; a zone without a region as itself.
    private static func zoneName(_ zone: String) -> String {
        guard zone.contains("/"), let city = zone.split(separator: "/").last else { return zone }
        return city.replacingOccurrences(of: "_", with: " ")
    }

    /// "3:00 PM EDT", with UTC read as "UTC" rather than Foundation's "GMT".
    private static func clock(_ instant: Date, zone: TimeZone) -> String {
        "\(format(instant, "h:mm a", zone: zone)) \(abbreviation(instant, zone: zone))"
    }

    /// `Intl.DateTimeFormat.formatRange` for one day: the shared meridiem and
    /// zone are written once ("10:00 – 11:00 AM EDT", "10:00 AM – 1:00 PM EDT").
    private static func clockRange(_ start: Date, _ end: Date, zone: TimeZone) -> String {
        let startZone = abbreviation(start, zone: zone)
        let endZone = abbreviation(end, zone: zone)
        guard startZone == endZone else { return "\(clock(start, zone: zone)) – \(clock(end, zone: zone))" }
        let startClock = format(start, "h:mm a", zone: zone)
        let endClock = format(end, "h:mm a", zone: zone)
        if startClock == endClock { return "\(endClock) \(endZone)" }
        let sameMeridiem = format(start, "a", zone: zone) == format(end, "a", zone: zone)
        let first = sameMeridiem ? format(start, "h:mm", zone: zone) : startClock
        return "\(first) – \(endClock) \(endZone)"
    }

    private static func abbreviation(_ instant: Date, zone: TimeZone) -> String {
        utcAliases.contains(zone.identifier) ? "UTC" : format(instant, "zzz", zone: zone)
    }

    private static func relative(_ value: Int, _ unit: String) -> String {
        let units = "\(abs(value)) \(unit)\(abs(value) == 1 ? "" : "s")"
        return value < 0 ? "\(units) ago" : "in \(units)"
    }

    /// "2026-10-09": the calendar day `instant` falls on in `zone`.
    private static func dayKey(_ instant: Date, _ zone: TimeZone) -> String {
        format(instant, "yyyy-MM-dd", zone: zone)
    }

    private static func daysBetween(_ from: String, _ to: String) -> Int {
        guard let start = dayFormatter.date(from: from), let end = dayFormatter.date(from: to) else { return 0 }
        return Int((end.timeIntervalSince(start) / 86_400).rounded())
    }

    private static func format(_ date: Date, _ pattern: String, zone: TimeZone) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = zone
        formatter.dateFormat = pattern
        return formatter.string(from: date)
    }

    private nonisolated(unsafe) static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private nonisolated(unsafe) static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
