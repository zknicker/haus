import Foundation

/// One time chip in prose: a clock time with an explicit zone, such as
/// "3 PM ET", "tomorrow at 9am Pacific", or "10–11 AM ET".
public struct TimeChipMatch: Hashable, Sendable {
    public let range: Range<String.Index>
    public let text: String
    public let startsAt: Date
    /// The range end, when the text is a range.
    public let endsAt: Date?
}

/// What prose needs to chip its clock times: the message's sent time, which
/// relative days resolve from, and the zone the viewer reads them in.
public struct TimeChipContext: Hashable, Sendable {
    public let sentAt: Date
    public let viewerZone: TimeZone

    public init(sentAt: Date, viewerZone: TimeZone) {
        self.sentAt = sentAt
        self.viewerZone = viewerZone
    }
}

/// Finds time chips in prose. An exact mirror of `findTimeChips` in
/// `packages/haus-api/src/time-chips.ts`, which owns the grammar and its
/// doc comment; `TimeChipFinderTests` carries its test table case for case.
///
/// The pattern is the App's, spelled for ICU: JavaScript's `\w`, `\d`, and `\s`
/// are written out as the classes JavaScript means (ASCII words and digits,
/// its whitespace set), because ICU reads the first two as Unicode classes.
/// Both engines index UTF-16, so the matches land on the same code units.
public enum TimeChipFinder {
    public static func find(in text: String, sentAt: Date) -> [TimeChipMatch] {
        guard let pattern else { return [] }
        let whole = NSRange(text.startIndex..., in: text)
        return pattern.matches(in: text, range: whole).compactMap { match in
            guard let range = Range(match.range, in: text) else { return nil }
            let groups = Groups(match: match, text: text)
            guard let resolved = resolve(groups, sentAt: sentAt) else { return nil }
            return TimeChipMatch(
                range: range,
                text: String(text[range]),
                startsAt: resolved.startsAt,
                endsAt: resolved.endsAt
            )
        }
    }

    // MARK: Grammar

    private static let zones: [String: String] = [
        "C": "America/Chicago", "Central": "America/Chicago",
        "E": "America/New_York", "Eastern": "America/New_York",
        "GMT": "UTC", "UTC": "UTC",
        "M": "America/Denver", "Mountain": "America/Denver",
        "P": "America/Los_Angeles", "Pacific": "America/Los_Angeles",
    ]

    /// JavaScript's `[\w:]`: an ASCII word character or a colon.
    private static let wordOrColon = "[A-Za-z0-9_:]"
    /// JavaScript's `\w`.
    private static let word = "[A-Za-z0-9_]"
    private static let digit = "[0-9]"
    private static let space = #"[\t\n\x{0B}\f\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]"#
    private static let meridiem = #"[AaPp]\.?[Mm]\.?"#
    private static func clock(_ n: Int) -> String {
        "(?<h\(n)>\(digit){1,2})(?::(?<m\(n)>\(digit){2})(?::(?<s\(n)>\(digit){2}))?)?\(space)?(?<ap\(n)>\(meridiem))?"
    }
    private static let dayWord = "[Tt]oday|[Tt]onight|[Tt]omorrow|[Yy]esterday"
    private static let weekday =
        "Mon(?:day)?|Tue(?:s(?:day)?)?|Wed(?:nesday)?|Thu(?:r(?:s(?:day)?)?)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?"
    private static let month =
        "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?"
    private static func date(_ p: String) -> String {
        "(?<\(p)Day>\(dayWord))|(?:(?:[Nn]ext\(space)+)?(?:\(weekday))\\.?,?\(space)+)?(?:(?<\(p)Mon>\(month))\\.?\(space)+"
            + "(?<\(p)Dom>\(digit){1,2})(?:st|nd|rd|th)?(?:,?\(space)+(?<\(p)Year>\(digit){4}))?"
            + "|(?<\(p)Iso>\(digit){4}-\(digit){2}-\(digit){2}))|(?:(?<\(p)Next>[Nn]ext)\(space)+)?(?<\(p)Wd>\(weekday))\\.?"
    }
    private static let ianaSegment = "[A-Z][A-Za-z_]*(?:-[a-z]+-[A-Z][A-Za-z_]*)?"
    private static func zone(_ p: String) -> String {
        "(?<\(p)iana>(?:Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific)"
            + "(?:/\(ianaSegment))+)"
            + "|(?<\(p)zone>UTC|GMT|(?<\(p)abbr>[ECMP])[SD]?T|Eastern|Central|Mountain|Pacific)(?:\(space)+[Tt]ime)?"
    }
    private static let statedZone =
        "(?:(?:[Yy]our\(space)+time\(space)+)?\\((?:\(zone("p")))\\)|(?:\(zone(""))))"

    private static let pattern = try? NSRegularExpression(
        pattern: "(?<!\(wordOrColon))(?:(?:\(date("pre")))(?:,?\(space)+at\(space)+|,\(space)+|\(space)+))?"
            + "\(clock(1))(?:\(space)*(?:[-–—]|to)\(space)*\(clock(2)))?\(space)+\(statedZone)"
            + "(?:\(space)+(?:on\(space)+)?(?:\(date("post"))))?(?!\(word)|:\(digit))"
    )

    static let groupNames = [
        "h1", "m1", "s1", "ap1", "h2", "m2", "s2", "ap2",
        "iana", "zone", "abbr", "piana", "pzone", "pabbr",
    ] + ["pre", "post"].flatMap { p in ["Day", "Mon", "Dom", "Year", "Iso", "Next", "Wd"].map { p + $0 } }

    private struct Groups {
        private var values: [String: String] = [:]

        init(match: NSTextCheckingResult, text: String) {
            for name in TimeChipFinder.groupNames {
                if let range = Range(match.range(withName: name), in: text) {
                    values[name] = String(text[range])
                }
            }
        }

        subscript(_ name: String) -> String? { values[name] }
        func either(_ first: String, _ second: String) -> String? { values[first] ?? values[second] }
    }

    // MARK: Resolution

    private static func resolve(_ groups: Groups, sentAt: Date) -> (startsAt: Date, endsAt: Date?)? {
        guard let timeZone = readZone(groups) else { return nil }
        let end = readClock(groups["h2"], groups["m2"], groups["s2"], groups["ap2"])
        let borrowed = groups["ap1"] == nil ? groups["ap2"] : nil
        guard var start = readClock(groups["h1"], groups["m1"], groups["s1"], groups["ap1"] ?? borrowed),
              !(groups["h2"] != nil && end == nil)
        else { return nil }
        if let end, borrowed != nil, start > end {
            start = (start + 12 * 3600) % 86_400
        }
        guard let day = readDay(groups, sentAt: sentAt, timeZone: timeZone) else { return nil }
        let startsAt = zonedInstant(day, seconds: start, timeZone: timeZone)
        guard let end else { return (startsAt, nil) }
        let endDay = end > start ? day : addDays(day, 1)
        return (startsAt, zonedInstant(endDay, seconds: end, timeZone: timeZone))
    }

    private static func readZone(_ groups: Groups) -> TimeZone? {
        if let iana = groups.either("iana", "piana") {
            // Known by exactly that spelling, as the App's `Intl` check requires.
            guard let zone = TimeZone(identifier: iana), zone.identifier == iana else { return nil }
            return zone
        }
        let key = groups["abbr"] ?? groups["pabbr"] ?? groups["zone"] ?? groups["pzone"] ?? ""
        return zones[key].flatMap { TimeZone(identifier: $0) }
    }

    /// Seconds after midnight, or nil when the clock is not a full time.
    private static func readClock(_ hourText: String?, _ minuteText: String?, _ secondText: String?, _ ap: String?) -> Int? {
        guard let hourText, let hour = Int(hourText) else { return nil }
        let minute = minuteText.flatMap { Int($0) } ?? 0
        let second = secondText.flatMap { Int($0) } ?? 0
        if minute > 59 || second > 59 { return nil }
        guard let ap, !ap.isEmpty else {
            return minuteText != nil && hour <= 23 ? hour * 3600 + minute * 60 + second : nil
        }
        if hour < 1 || hour > 12 { return nil }
        let pm = ap.first?.lowercased() == "p"
        return ((hour % 12) + (pm ? 12 : 0)) * 3600 + minute * 60 + second
    }

    struct CalendarDay: Equatable {
        var year: Int
        var month: Int
        var day: Int
    }

    private static let weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
    private static let months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    private static let dayOffsets = ["today": 0, "tonight": 0, "tomorrow": 1, "yesterday": -1]

    private static func readDay(_ groups: Groups, sentAt: Date, timeZone: TimeZone) -> CalendarDay? {
        let sent = calendarDay(sentAt, timeZone: timeZone)
        if let word = groups.either("preDay", "postDay") {
            return addDays(sent, dayOffsets[word.lowercased()] ?? 0)
        }
        if let iso = groups.either("preIso", "postIso") {
            let parts = iso.split(separator: "-").map { Int($0) ?? 0 }
            return validDay(CalendarDay(year: parts[0], month: parts[1], day: parts[2]))
        }
        if let monthName = groups.either("preMon", "postMon") {
            let explicitYear = groups.either("preYear", "postYear")
            var named = CalendarDay(
                year: explicitYear.flatMap { Int($0) } ?? sent.year,
                month: (months.firstIndex(of: String(monthName.prefix(3)).lowercased()) ?? -1) + 1,
                day: groups.either("preDom", "postDom").flatMap { Int($0) } ?? 0
            )
            if explicitYear == nil, daysFrom(sent, named) < -182 {
                named.year += 1
            }
            return validDay(named)
        }
        if let weekdayName = groups.either("preWd", "postWd") {
            let target = weekdays.firstIndex(of: String(weekdayName.prefix(3)).lowercased()) ?? -1
            let current = ((epochDay(sent) % 7) + 11) % 7 // 1970-01-01 was a Thursday.
            // "next" means strictly after the sent day.
            let strictlyAfter = groups.either("preNext", "postNext") != nil
            return addDays(sent, strictlyAfter ? (target - current + 6) % 7 + 1 : (target - current + 7) % 7)
        }
        return sent
    }

    private static func validDay(_ day: CalendarDay) -> CalendarDay? {
        let normalized = addDays(day, 0)
        return normalized.day == day.day && normalized.month == day.month ? day : nil
    }

    static func addDays(_ day: CalendarDay, _ days: Int) -> CalendarDay {
        civil(epochDay(CalendarDay(year: day.year, month: day.month, day: day.day + days)))
    }

    private static func daysFrom(_ from: CalendarDay, _ to: CalendarDay) -> Int {
        epochDay(to) - epochDay(from)
    }

    private static func calendarDay(_ instant: Date, timeZone: TimeZone) -> CalendarDay {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let parts = calendar.dateComponents([.year, .month, .day], from: instant)
        return CalendarDay(year: parts.year ?? 0, month: parts.month ?? 0, day: parts.day ?? 0)
    }

    /// The instant a wall-clock time in `timeZone` names (DST-aware), by the
    /// App's two-guess offset walk so gaps and overlaps land where it lands.
    private static func zonedInstant(_ day: CalendarDay, seconds: Int, timeZone: TimeZone) -> Date {
        let wall = TimeInterval(epochDay(day) * 86_400 + seconds)
        let firstOffset = offset(at: wall, timeZone: timeZone)
        let guess = wall - firstOffset
        let secondOffset = offset(at: guess, timeZone: timeZone)
        return Date(timeIntervalSince1970: secondOffset == firstOffset ? guess : wall - secondOffset)
    }

    private static func offset(at seconds: TimeInterval, timeZone: TimeZone) -> TimeInterval {
        TimeInterval(timeZone.secondsFromGMT(for: Date(timeIntervalSince1970: seconds)))
    }

    /// Days since 1970-01-01 for a proleptic Gregorian date, with the month and
    /// day allowed to overflow the way `setUTCFullYear` normalizes them; a year
    /// 0–99 stays literal.
    static func epochDay(_ date: CalendarDay) -> Int {
        var year = date.year
        let monthIndex = date.month - 1
        year += Int((Double(monthIndex) / 12).rounded(.down))
        let month = ((monthIndex % 12) + 12) % 12 + 1
        // Howard Hinnant's days_from_civil.
        let y = month <= 2 ? year - 1 : year
        let era = (y >= 0 ? y : y - 399) / 400
        let yoe = y - era * 400
        let doy = (153 * (month + (month > 2 ? -3 : 9)) + 2) / 5
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146_097 + doe - 719_468 + date.day - 1
    }

    static func civil(_ days: Int) -> CalendarDay {
        let z = days + 719_468
        let era = (z >= 0 ? z : z - 146_096) / 146_097
        let doe = z - era * 146_097
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        let mp = (5 * doy + 2) / 153
        let day = doy - (153 * mp + 2) / 5 + 1
        let month = mp < 10 ? mp + 3 : mp - 9
        return CalendarDay(year: yoe + era * 400 + (month <= 2 ? 1 : 0), month: month, day: day)
    }
}
