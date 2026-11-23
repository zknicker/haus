import Foundation
import HausModels

/// One capacity window a model connection reports: how much of it is used and when it resets.
public struct ModelCapacityWindow: Identifiable, Equatable, Sendable {
    public let id: String
    public let label: String
    public let usedPercent: Double
    public let resetsAt: Date?

    public init(id: String, label: String, usedPercent: Double, resetsAt: Date?) {
        self.id = id
        self.label = label
        self.usedPercent = usedPercent
        self.resetsAt = resetsAt
    }

    public init(_ window: ModelConnectionCapacityWindow) {
        self.init(
            id: window.id,
            label: window.label,
            usedPercent: window.usedPercent,
            resetsAt: window.resetsAt
        )
    }

    /// Whole percent left, clamped to 0–100, matching the web's `percentLeft`.
    public var percentLeft: Int {
        Int((100 - min(max(usedPercent, 0), 100)).rounded())
    }

    /// The share of the window left, 0–1, for a meter.
    public var fractionLeft: Double { Double(percentLeft) / 100 }

    /// "Resets in 3h", or nil when the window has no reset time or it has passed.
    public func resetLine(now: Date = .now) -> String? {
        guard let resetsAt, resetsAt > now else { return nil }
        return "Resets in \(Self.resetsIn(resetsAt, now: now))"
    }

    /// The window with the least left, which is the one that limits the connection.
    public static func tightest(_ windows: [ModelCapacityWindow]) -> ModelCapacityWindow? {
        windows.min { $0.percentLeft < $1.percentLeft }
    }

    /// "45m", "3h", "2d", the same steps as the web's `resetsIn`.
    static func resetsIn(_ date: Date, now: Date) -> String {
        let minutes = max(1, Int((date.timeIntervalSince(now) / 60).rounded()))
        if minutes < 60 { return "\(minutes)m" }
        let hours = Int((Double(minutes) / 60).rounded())
        return hours < 48 ? "\(hours)h" : "\(Int((Double(hours) / 24).rounded()))d"
    }
}
