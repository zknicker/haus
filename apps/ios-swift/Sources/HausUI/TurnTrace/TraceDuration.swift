import Foundation

/// Durations as the turn trace states them. Ported from the App's `turn-trace-duration.ts`.
enum TraceDuration {
    /// A step's duration. A settled call under a second is noise beside a 45s one, so it shows
    /// nothing; a running step always shows its elapsed whole seconds so the clock visibly ticks.
    static func step(milliseconds: Int?, isRunning: Bool = false, showsSubsecond: Bool = false) -> String? {
        guard let milliseconds else { return isRunning ? "0s" : nil }
        if isRunning { return seconds(milliseconds / 1_000) }
        if milliseconds < 1_000 {
            return showsSubsecond && milliseconds > 0 ? "\(milliseconds)ms" : nil
        }
        if milliseconds < 10_000 { return String(format: "%.1fs", Double(milliseconds) / 1_000) }
        return seconds(Int((Double(milliseconds) / 1_000).rounded()))
    }

    /// "48s", "1m 42s", "2m".
    static func seconds(_ total: Int) -> String {
        guard total >= 60 else { return "\(max(0, total))s" }
        let minutes = total / 60
        let seconds = total % 60
        return seconds == 0 ? "\(minutes)m" : "\(minutes)m \(seconds)s"
    }

    /// A whole-second span between two instants, never negative.
    static func elapsed(from start: Date, to end: Date) -> String {
        seconds(Int(max(0, end.timeIntervalSince(start)).rounded(.down)))
    }
}
