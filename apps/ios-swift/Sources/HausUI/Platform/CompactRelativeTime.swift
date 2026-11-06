import Foundation

/// The compact "now / 5m / 3h / 2d / Aug 18" age used by dense rows such as
/// thread previews, claim rows, and search results.
enum HausCompactRelativeTime {
    static func label(for date: Date, now: Date = .now) -> String {
        let seconds = max(0, Int(now.timeIntervalSince(date)))
        if seconds < 60 { return "now" }
        if seconds < 3_600 { return "\(seconds / 60)m" }
        if seconds < 86_400 { return "\(seconds / 3_600)h" }
        if seconds < 604_800 { return "\(seconds / 86_400)d" }
        return date.formatted(.dateTime.month(.abbreviated).day())
    }
}
