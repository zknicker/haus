import Foundation

/// A Task's `dueOn`: a calendar day, not an instant. It reads the same in every
/// zone, so it is parsed and written through date components in the reader's
/// own calendar, never through a UTC timestamp that could slip a day.
public enum TaskDueDate {
    /// The start of the day in `calendar`, or nil for anything but `YYYY-MM-DD`.
    public static func date(_ dueOn: String, calendar: Calendar = .current) -> Date? {
        let parts = dueOn.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3,
              parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
              let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2])
        else { return nil }
        let components = DateComponents(year: year, month: month, day: day)
        guard components.isValidDate(in: calendar) else { return nil }
        return calendar.date(from: components)
    }

    /// The day `date` falls on in `calendar`, as the wire writes it.
    public static func dueOn(from date: Date, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// Past due from the day after: a Task due today is on time all day.
    public static func isOverdue(_ dueOn: String, now: Date = .now, calendar: Calendar = .current) -> Bool {
        guard let due = date(dueOn, calendar: calendar) else { return false }
        return due < calendar.startOfDay(for: now)
    }

    /// `Nov 4`, or `Nov 4, 2027` outside the reader's current year.
    public static func label(_ dueOn: String, now: Date = .now, calendar: Calendar = .current) -> String? {
        guard let due = date(dueOn, calendar: calendar) else { return nil }
        var style = Date.FormatStyle(date: .omitted, time: .omitted, calendar: calendar, timeZone: calendar.timeZone)
            .month(.abbreviated)
            .day()
        if calendar.component(.year, from: due) != calendar.component(.year, from: now) {
            style = style.year()
        }
        return due.formatted(style)
    }
}
