import Foundation

/// The slice of the `stats.live` snapshot the Inbox reads. The Server also
/// reports per-Computer capacity and token totals in the same payload; nothing
/// on the phone renders those yet, so they are deliberately not modeled and
/// decoding ignores them.
public struct ServerUsageSnapshot: Decodable, Sendable, Equatable {
    public let tokenUsage: ServerTokenUsage

    public init(tokenUsage: ServerTokenUsage) {
        self.tokenUsage = tokenUsage
    }
}

public struct ServerTokenUsage: Decodable, Sendable, Equatable {
    public let breakdown: [AgentTokenUsageRow]

    public init(breakdown: [AgentTokenUsageRow]) {
        self.breakdown = breakdown
    }
}

/// One Agent's processed tokens on one UTC day. The Server emits a row per
/// model and runtime configuration, so one Agent-day can carry several rows.
public struct AgentTokenUsageRow: Decodable, Sendable, Equatable {
    public let agentID: String
    /// A UTC calendar day, `yyyy-MM-dd`. Compared as a string exactly as the
    /// App compares it: the format sorts lexicographically.
    public let date: String
    public let totalTokens: Int

    public init(agentID: String, date: String, totalTokens: Int) {
        self.agentID = agentID
        self.date = date
        self.totalTokens = totalTokens
    }

    enum CodingKeys: String, CodingKey {
        case agentID = "agentId"
        case date
        case totalTokens
    }
}

public struct AgentUsageDay: Sendable, Equatable {
    public let date: String
    public let tokens: Int

    public init(date: String, tokens: Int) {
        self.date = date
        self.tokens = tokens
    }
}

public struct AgentUsageSummary: Sendable, Equatable {
    /// How many days the window covers.
    public let days: Int
    public let points: [AgentUsageDay]
    public let totalTokens: Int

    public init(days: Int, points: [AgentUsageDay], totalTokens: Int) {
        self.days = days
        self.points = points
        self.totalTokens = totalTokens
    }
}

/// The Swift port of the App's `summarizeAgentTokenUsage`, sliced from the one
/// Server-wide usage read rather than a per-Agent query.
public enum AgentTokenUsage {
    /// The Inbox's "Active this week" window.
    public static let inboxWindowDays = 7

    /// One Agent's processed-token volume as a headline number and a daily
    /// series. Every day in the window is present, including the silent ones,
    /// so a sparkline reads as a timeline rather than as a list of busy days.
    public static func summarize(
        _ usage: ServerTokenUsage,
        agentID: String,
        days: Int = inboxWindowDays,
        asOf: Date = Date()
    ) -> AgentUsageSummary {
        let dates = datesThroughToday(days: days, asOf: asOf)
        guard let start = dates.first, let end = dates.last else {
            return AgentUsageSummary(days: days, points: [], totalTokens: 0)
        }

        var tokensByDate: [String: Int] = [:]
        var totalTokens = 0
        for row in usage.breakdown
        where row.agentID == agentID && row.date >= start && row.date <= end {
            tokensByDate[row.date, default: 0] += row.totalTokens
            totalTokens += row.totalTokens
        }

        return AgentUsageSummary(
            days: days,
            points: dates.map { AgentUsageDay(date: $0, tokens: tokensByDate[$0] ?? 0) },
            totalTokens: totalTokens
        )
    }

    /// The UTC calendar days the window covers, oldest first, ending on the day
    /// `asOf` falls in. Usage days are UTC days, so the phone's own time zone
    /// must not decide which day a token landed on.
    public static func datesThroughToday(days: Int, asOf: Date) -> [String] {
        guard days > 0 else { return [] }
        let end = utcCalendar.startOfDay(for: asOf)
        return (0..<days).compactMap { index in
            utcCalendar
                .date(byAdding: .day, value: index - (days - 1), to: end)
                .map { dayFormatter.string(from: $0) }
        }
    }

    private static let utcCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .gmt
        return calendar
    }()

    nonisolated(unsafe) private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}
