import Foundation

/// A Reminder runs once or repeats, and every surface states which before
/// anything else. Presentation only: the Server's `fireAt` stays
/// authoritative, including an off-slot first fire. Mirrors the App's
/// `reminder-schedule-presentation.ts`.
public enum ReminderKind: Sendable {
    case once
    case recurring

    public init(repeatRule: String?) {
        self = repeatRule == nil ? .once : .recurring
    }

    public var label: String {
        self == .once ? "One-time reminder" : "Recurring reminder"
    }
}

/// The viewer's clock: their saved zone (`HumanTimezone.viewerZone`), their
/// locale, and the instant "today" is measured from.
public struct ReminderScheduleContext: Sendable {
    public let locale: Locale
    public let now: Date
    public let viewerZone: TimeZone

    public init(locale: Locale = .current, now: Date = Date(), viewerZone: TimeZone) {
        self.locale = locale
        self.now = now
        self.viewerZone = viewerZone
    }
}

/// The detail screen's Schedule rows. This is where the schedule's own zone lives.
public struct ReminderScheduleDetail: Equatable, Sendable {
    /// When it runs next, in the viewer's time.
    public let nextRun: String
    /// "Doesn't repeat", or the cadence in the viewer's time.
    public let repeats: String
    /// The schedule's own zone, and the next run's clock there when it differs.
    public let timezone: String
}

public enum ReminderSchedulePresentation {
    /// The row's one line, in the viewer's own time:
    /// "Once · Tomorrow at 9:00 AM" or "Every Monday at 3:57 PM · Next run Mon, Oct 12".
    /// A recurring row names the next run's clock only when the cadence does
    /// not already say it — an interval has no clock, and an off-slot first
    /// fire has a different one.
    public static func rowSummary(
        fireAt: Date,
        repeatRule: String?,
        timezone: String,
        context: ReminderScheduleContext
    ) -> String {
        let time = ScheduleClock.clock(fireAt, context.viewerZone, context.locale)
        guard let repeatRule else {
            return "Once · \(capitalized(dayPhrase(fireAt, context))) at \(time)"
        }
        let cadence = ReminderCadence.viewerPhrase(
            repeatRule,
            fireAt: fireAt,
            scheduleZone: timezone,
            viewerZone: context.viewerZone,
            locale: context.locale
        )
        let day = dayPhrase(fireAt, context)
        let next = cadence.hasSuffix(" at \(time)") ? day : "\(day) at \(time)"
        return "\(cadence) · Next run \(next)"
    }

    public static func detail(
        fireAt: Date,
        repeatRule: String?,
        timezone: String,
        context: ReminderScheduleContext
    ) -> ReminderScheduleDetail {
        let clock = ScheduleClock.clock(fireAt, context.viewerZone, context.locale)
        let repeats = repeatRule.map {
            ReminderCadence.viewerPhrase(
                $0,
                fireAt: fireAt,
                scheduleZone: timezone,
                viewerZone: context.viewerZone,
                locale: context.locale
            )
        }
        return ReminderScheduleDetail(
            nextRun: "\(capitalized(dayPhrase(fireAt, context, fullDate: true))) at \(clock)",
            repeats: repeats ?? "Doesn't repeat",
            timezone: timezoneLine(fireAt, zoneName: timezone, context: context)
        )
    }

    private static func timezoneLine(_ fire: Date, zoneName: String, context: ReminderScheduleContext) -> String {
        guard let zone = TimeZone(identifier: zoneName) else {
            return "\(zoneName) · Unrecognized timezone"
        }
        let label = zoneLabel(zoneName)
        if zone.secondsFromGMT(for: fire) == context.viewerZone.secondsFromGMT(for: fire) {
            return "\(label) · Same as yours"
        }
        let sameDay = ScheduleClock.dayKey(fire, zone) == ScheduleClock.dayKey(fire, context.viewerZone)
        let there = ScheduleClock.format(fire, zone, context.locale, template: sameDay ? "jmm" : "EEEjmm")
        return "\(label) · \(there) there"
    }

    /// "today", "tomorrow", "yesterday" (a wake still waiting on an offline
    /// Agent), otherwise the date — with its year only when it is not this
    /// year, unless the caller wants the full date.
    private static func dayPhrase(_ fire: Date, _ context: ReminderScheduleContext, fullDate: Bool = false) -> String {
        let fireDay = ScheduleClock.dayKey(fire, context.viewerZone)
        let today = ScheduleClock.dayKey(context.now, context.viewerZone)
        let offset = ScheduleClock.daysBetween(today, fireDay)
        if !fullDate, abs(offset) <= 1 {
            let relative = RelativeDateTimeFormatter()
            relative.locale = context.locale
            relative.dateTimeStyle = .named
            relative.unitsStyle = .full
            return relative.localizedString(from: DateComponents(day: offset))
        }
        let calendar = ScheduleClock.calendar(context.viewerZone)
        let otherYear = calendar.component(.year, from: fire) != calendar.component(.year, from: context.now)
        let template = fullDate || otherYear ? "EEEMMMdy" : "EEEMMMd"
        return ScheduleClock.format(fire, context.viewerZone, context.locale, template: template)
    }

    private static let regionPrefixes: Set<String> = [
        "Africa", "America", "Antarctica", "Arctic", "Asia", "Atlantic",
        "Australia", "Europe", "Indian", "Pacific",
    ]

    private static func zoneLabel(_ zone: String) -> String {
        let parts = zone.split(separator: "/")
        guard parts.count > 1, let region = parts.first, regionPrefixes.contains(String(region)),
              let city = parts.last else { return zone }
        return "\(city.replacingOccurrences(of: "_", with: " ")) time"
    }

    private static func capitalized(_ value: String) -> String {
        value.prefix(1).uppercased() + value.dropFirst()
    }
}

public extension Reminder {
    var kind: ReminderKind { ReminderKind(repeatRule: repeatRule) }

    func rowSummary(_ context: ReminderScheduleContext) -> String {
        ReminderSchedulePresentation.rowSummary(
            fireAt: fireAt, repeatRule: repeatRule, timezone: timezone, context: context
        )
    }

    func scheduleDetail(_ context: ReminderScheduleContext) -> ReminderScheduleDetail {
        ReminderSchedulePresentation.detail(
            fireAt: fireAt, repeatRule: repeatRule, timezone: timezone, context: context
        )
    }

    /// The detail's Instructions: what the short title stands for. A Reminder
    /// written before the title/description split copied its title here, so an
    /// identical one is said once — by the title.
    var instructions: String? {
        guard let text = description?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty,
              text != title.trimmingCharacters(in: .whitespacesAndNewlines) else { return nil }
        return text
    }
}
