import Foundation
import HausModels

/// Where a record was posted, as every Inbox row names it.
///
/// A DM reads as `DM` and never as the peer's name: the Agent or person is
/// already stated beside this label, and naming them again reads as "Tiny in
/// Tiny". This is the same rule the Task lens uses.
public enum InboxConversationLabel {
    public static func text(kind: HausModels.ChatKind, name: String?) -> String {
        switch kind {
        case .channel: "#\(name ?? "channel")"
        case .dm: "DM"
        }
    }
}

/// How long something has been going, in the Cloud Agent grammar every Haus
/// surface already states elapsed time in: `45s`, `25m`, `2h`, `2h 5m`.
public enum InboxElapsed {
    public static func label(since start: Date?, now: Date) -> String? {
        guard let start else { return nil }
        return duration(seconds: max(0, Int(now.timeIntervalSince(start))))
    }

    static func duration(seconds: Int) -> String {
        if seconds < 60 { return "\(seconds)s" }
        let minutes = seconds / 60
        if minutes < 60 { return "\(minutes)m" }
        let hours = minutes / 60
        let remainder = minutes % 60
        return remainder == 0 ? "\(hours)h" : "\(hours)h \(remainder)m"
    }

    /// A step label carries a trailing ellipsis to say "still going". Once an
    /// elapsed clause follows it the clause says that instead, so the ellipsis
    /// comes off rather than reading as `Editing files… · 3m`.
    public static func stepWithElapsed(_ label: String, occurredAt: Date, now: Date) -> String {
        guard let elapsed = Self.label(since: occurredAt, now: now) else { return label }
        var step = label
        while step.hasSuffix("…") || step.hasSuffix(".") {
            step.removeLast()
        }
        return "\(step) · \(elapsed)"
    }
}

/// A week card's headline figure. Large counts read compactly — `18.4K` — the
/// same shaping the App's usage surfaces use.
public enum InboxTokens {
    public static func format(_ value: Int) -> String {
        guard value >= 10_000 else { return value.formatted(.number.grouping(.automatic)) }
        return value.formatted(.number.notation(.compactName).precision(.fractionLength(0...1)))
    }
}
