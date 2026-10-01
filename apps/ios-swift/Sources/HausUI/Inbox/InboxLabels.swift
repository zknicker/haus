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

/// The name a row falls back to when the directory no longer lists its actor:
/// the Message's own stored author profile, and a generic noun for one that
/// left no profile either.
public enum InboxActorName {
    public static func stored(_ author: ChatAuthor) -> String {
        switch author {
        case .agent(let agentID, let profile):
            profile?.displayName ?? "Agent \(String(agentID.suffix(6)))"
        case .human(let profile, _):
            profile?.displayName ?? "Haus member"
        case .system:
            "Haus"
        }
    }
}

/// How long something has been going, in the Cloud Agent grammar every Haus
/// surface already states elapsed time in: `45s`, `25m`, `2h`, `2h 5m`.
public enum InboxElapsed {
    public static func label(since start: Date, now: Date) -> String {
        CloudAgentPresentation.duration(seconds: Int(now.timeIntervalSince(start)))
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
