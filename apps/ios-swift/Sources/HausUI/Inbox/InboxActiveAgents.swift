import Foundation

/// The Agents worth a card in "Active this week".
///
/// This is deliberately not a roster. A Server can hold thirty-five Agents, and
/// a card for every one of them is a wall to scan rather than a thing to read;
/// the strip carries the handful that actually moved this week, working Agents
/// first, then the busiest week, then the name so the order is stable when two
/// Agents burned the same amount.
///
/// An Agent that ran nothing and is running nothing has no week to show, so it
/// is not a quiet card in the strip; it is simply not in it.
public enum InboxActiveAgents {
    /// How many Agents the strip will carry — the number a person can scan in
    /// one pass.
    public static let limit = 8

    public static func rank(
        _ entries: [InboxAgentWeek],
        limit: Int = limit
    ) -> [InboxAgentWeek] {
        entries
            .filter { $0.totalTokens > 0 || $0.isLive }
            .sorted { left, right in
                if left.isLive != right.isLive { return left.isLive }
                if left.totalTokens != right.totalTokens {
                    return left.totalTokens > right.totalTokens
                }
                return left.name.localizedCaseInsensitiveCompare(right.name) == .orderedAscending
            }
            .prefix(limit)
            .map { $0 }
    }
}
