import Foundation

/// Capped exponential backoff for the App's own recovery loops: stream
/// restarts, the live launch load, and identity sync.
public enum RetryBackoff {
    public static let maximumSeconds: Double = 60

    /// 1s, 2s, 4s … for attempts 0, 1, 2 …, never more than a minute.
    public static func delay(attempt: Int) -> Duration {
        let exponent = min(max(attempt, 0), 6)
        return .seconds(min(Double(1 << exponent), maximumSeconds))
    }
}
