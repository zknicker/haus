import Foundation

/// A Reminder's `repeat` grammar, parsed once and phrased for a person — the
/// App's `reminder-cadence.ts`. Calendar cadences (`daily@HH:MM`,
/// `weekly:mon,wed@HH:MM`) are wall-clock promises in the Reminder's own
/// timezone; fixed intervals (`every:N[mhd]`) are durations and never gain a
/// clock time.
public enum ReminderCadence: Equatable, Sendable {
    /// `weekdays` are 0 (Sunday) through 6, sorted; nil means every day.
    case calendar(hour: Int, minute: Int, weekdays: [Int]?)
    case interval(label: String)
    case unknown(String)

    private static let weekdayCodes = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]

    public init(_ repeatRule: String) {
        if let label = Self.intervalLabel(repeatRule) {
            self = .interval(label: label)
            return
        }
        self = Self.calendar(repeatRule) ?? .unknown(repeatRule)
    }

    /// "Every Monday at 3:57 PM", with the slot moved into the viewer's zone.
    /// The slot is converted on the date of the next fire, so DST and a slot
    /// that lands on another calendar day for the viewer both come out right.
    /// An unknown schedule zone leaves the slot exactly as written.
    public static func viewerPhrase(
        _ repeatRule: String,
        fireAt: Date,
        scheduleZone: String,
        viewerZone: TimeZone,
        locale: Locale
    ) -> String {
        switch ReminderCadence(repeatRule) {
        case .interval(let label):
            return label
        case .unknown(let raw):
            return raw
        case .calendar(let hour, let minute, let weekdays):
            let zone = TimeZone(identifier: scheduleZone)
            let source = zone ?? ScheduleClock.utc
            let shown = zone == nil ? ScheduleClock.utc : viewerZone
            var wall = ScheduleClock.calendar(source).dateComponents([.year, .month, .day], from: fireAt)
            wall.hour = hour
            wall.minute = minute
            let instant = ScheduleClock.calendar(source).date(from: wall) ?? fireAt
            let shift = ScheduleClock.daysBetween(
                ScheduleClock.dayKey(instant, source),
                ScheduleClock.dayKey(instant, shown)
            )
            let days = weekdays?.map { ($0 + shift + 7) % 7 }
            let time = ScheduleClock.clock(instant, shown, locale)
            return "\(frequency(days, locale: locale)) at \(time)"
        }
    }

    static func frequency(_ weekdays: [Int]?, locale: Locale) -> String {
        guard let weekdays else { return "Daily" }
        let sorted = Array(Set(weekdays)).sorted()
        let formatter = DateFormatter()
        formatter.locale = locale
        let symbols = sorted.count == 1 ? formatter.weekdaySymbols : formatter.shortWeekdaySymbols
        let names = sorted.compactMap { symbols?[$0] }
        let list = ListFormatter()
        list.locale = locale
        return "Every \(list.string(from: names) ?? names.joined(separator: ", "))"
    }

    private static func calendar(_ rule: String) -> ReminderCadence? {
        let parts = rule.split(separator: "@", omittingEmptySubsequences: false)
        guard parts.count == 2 else { return nil }
        let clock = parts[1].split(separator: ":", omittingEmptySubsequences: false)
        guard clock.count == 2,
              clock.allSatisfy({ $0.count == 2 && $0.allSatisfy(\.isASCIIDigit) }),
              let hour = Int(clock[0]), let minute = Int(clock[1]),
              hour <= 23, minute <= 59 else { return nil }
        let head = String(parts[0])
        if head == "daily" {
            return .calendar(hour: hour, minute: minute, weekdays: nil)
        }
        guard head.hasPrefix("weekly:") else { return nil }
        let codes = head.dropFirst("weekly:".count)
        guard !codes.isEmpty, codes.allSatisfy({ ($0 >= "a" && $0 <= "z") || $0 == "," }) else { return nil }
        var days: [Int] = []
        for code in codes.split(separator: ",", omittingEmptySubsequences: false) {
            guard let day = weekdayCodes.firstIndex(of: String(code)) else { return nil }
            if !days.contains(day) { days.append(day) }
        }
        return .calendar(hour: hour, minute: minute, weekdays: days.sorted())
    }

    private static func intervalLabel(_ rule: String) -> String? {
        guard rule.hasPrefix("every:"), let unit = rule.last, "mhd".contains(unit) else { return nil }
        let digits = rule.dropFirst("every:".count).dropLast()
        guard !digits.isEmpty, digits.allSatisfy(\.isASCIIDigit), let amount = Int(digits) else { return nil }
        let name = unit == "m" ? "minute" : unit == "h" ? "hour" : "day"
        let milliseconds = unit == "m" ? 60_000 : unit == "h" ? 3_600_000 : 86_400_000
        // The App refuses anything past JavaScript's safe-integer range.
        let (product, overflow) = amount.multipliedReportingOverflow(by: milliseconds)
        guard amount >= 1, !overflow, product <= 9_007_199_254_740_991 else { return nil }
        return "Every \(amount) \(name)\(amount == 1 ? "" : "s")"
    }
}

/// Calendar arithmetic in one zone, shared by the cadence and schedule phrasing.
enum ScheduleClock {
    static let utc = TimeZone(identifier: "UTC")!

    static func calendar(_ zone: TimeZone) -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        return calendar
    }

    /// A calendar day in one zone, as days since 1970-01-01.
    static func dayKey(_ date: Date, _ zone: TimeZone) -> Int {
        let parts = calendar(zone).dateComponents([.year, .month, .day], from: date)
        let midnight = calendar(utc).date(from: parts) ?? date
        return Int((midnight.timeIntervalSince1970 / 86_400).rounded(.down))
    }

    static func daysBetween(_ from: Int, _ to: Int) -> Int { to - from }

    static func format(_ date: Date, _ zone: TimeZone, _ locale: Locale, template: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = zone
        formatter.setLocalizedDateFormatFromTemplate(template)
        return formatter.string(from: date)
    }

    static func clock(_ date: Date, _ zone: TimeZone, _ locale: Locale) -> String {
        format(date, zone, locale, template: "jmm")
    }
}

private extension Character {
    var isASCIIDigit: Bool { isASCII && isNumber }
}
