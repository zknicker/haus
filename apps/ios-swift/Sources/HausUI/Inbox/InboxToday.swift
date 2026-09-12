import Foundation

/// The Inbox's opening line: who is reading, and what day it is. It is the one
/// place the page addresses the person rather than the work, so it stays to a
/// greeting and a date — the Swift port of the App's `inbox-today.ts`.
public enum InboxToday {
    /// Greeting by the reader's own clock. A name is required: a bare "Good
    /// morning" addresses nobody, so the header waits for the member directory
    /// rather than greeting a blank.
    public static func greeting(
        name: String,
        now: Date = .now,
        calendar: Calendar = .current
    ) -> String {
        "\(dayPart(hour: calendar.component(.hour, from: now))), \(firstName(name))"
    }

    public static func dateLabel(now: Date = .now, locale: Locale = .current) -> String {
        now.formatted(
            .dateTime.weekday(.wide).month(.wide).day().locale(locale)
        )
    }

    static func dayPart(hour: Int) -> String {
        if hour < 12 { return "Good morning" }
        return hour < 18 ? "Good afternoon" : "Good evening"
    }

    /// A greeting uses the name a person is called, not their filing name.
    static func firstName(_ displayName: String) -> String {
        let trimmed = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.split(whereSeparator: { $0.isWhitespace }).first.map(String.init)
            ?? trimmed
    }
}
