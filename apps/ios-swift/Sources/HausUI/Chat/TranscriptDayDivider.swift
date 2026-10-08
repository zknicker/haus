import SwiftUI

/// The quiet rule that opens a calendar day in a transcript: a centred label
/// between two hairlines, in the caption ink the row timestamps use.
struct TranscriptDayDivider: View {
    let date: Date

    var body: some View {
        let title = TranscriptDayLabel.title(for: date)
        HStack(spacing: 10) {
            rule
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .layoutPriority(1)
            rule
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title)
        .accessibilityAddTraits(.isHeader)
    }

    private var rule: some View {
        Rectangle()
            .fill(.separator)
            .frame(height: 1 / 3)
            .frame(maxWidth: .infinity)
    }
}

/// What a day divider says: Today, Yesterday, a weekday within the last week,
/// then the date — with the year only when it is not this one.
enum TranscriptDayLabel {
    static func title(
        for date: Date,
        now: Date = .now,
        calendar: Calendar = .current,
        locale: Locale = .current
    ) -> String {
        if calendar.isDate(date, inSameDayAs: now) { return "Today" }
        let today = calendar.startOfDay(for: now)
        let day = calendar.startOfDay(for: date)
        let daysAgo = calendar.dateComponents([.day], from: day, to: today).day ?? .max
        if daysAgo == 1 { return "Yesterday" }
        var style = Date.FormatStyle(locale: locale, calendar: calendar, timeZone: calendar.timeZone)
        if (2...6).contains(daysAgo) {
            return date.formatted(style.weekday(.wide))
        }
        style = style.weekday(.abbreviated).month(.abbreviated).day()
        if !calendar.isDate(date, equalTo: now, toGranularity: .year) {
            style = style.year()
        }
        return date.formatted(style)
    }
}
