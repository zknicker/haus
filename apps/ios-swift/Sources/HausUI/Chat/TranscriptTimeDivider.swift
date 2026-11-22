import SwiftUI

/// The centered time that opens a turn in the assistant layout: no rules, just
/// the moment in faint ink.
struct TranscriptTimeDivider: View {
    let date: Date

    var body: some View {
        let title = TranscriptTimeLabel.title(for: date)
        Text(title)
            .hausFont(.transcriptTurnTime)
            .foregroundStyle(HausPlatformColor.faintInk)
            .lineLimit(1)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 4)
            .accessibilityAddTraits(.isHeader)
    }
}

/// What a turn time says: the time alone today, otherwise the day label
/// (`TranscriptDayLabel`) followed by the time.
enum TranscriptTimeLabel {
    static func title(
        for date: Date,
        now: Date = .now,
        calendar: Calendar = .current,
        locale: Locale = .current
    ) -> String {
        let time = date.formatted(
            Date.FormatStyle(locale: locale, calendar: calendar, timeZone: calendar.timeZone)
                .hour()
                .minute()
        )
        if calendar.isDate(date, inSameDayAs: now) { return time }
        let day = TranscriptDayLabel.title(for: date, now: now, calendar: calendar, locale: locale)
        return "\(day) \(time)"
    }
}

extension HausTextRole {
    static let transcriptTurnTime = HausTextRole(size: 14, weight: .regular, textStyle: .footnote)
    static let transcriptAuthor = HausTextRole(size: 15, weight: .semibold, textStyle: .subheadline)
    static let transcriptTime = HausTextRole(size: 13, weight: .regular, textStyle: .footnote)
}
