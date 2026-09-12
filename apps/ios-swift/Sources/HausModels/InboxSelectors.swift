import Foundation

/// The only Task fields the Inbox's stalled-claim question depends on.
public protocol StalledClaimTask {
    var live: Bool { get }
    var origin: TaskOrigin { get }
    var status: TaskStatus { get }
    var tier: TaskTier { get }
}

extension MessageTask: StalledClaimTask {}

/// What the Inbox's "Needs you" section lists, as pure functions over the two
/// Server reads behind it. The section and the badge that counts it read
/// through the same selectors, so they can never disagree.
public enum InboxNeedsYou {
    /// A claim an Agent took and did not finish.
    ///
    /// Every clause is load-bearing. `claimed` keeps this to an Agent's own
    /// lock; `inProgress` means the work never landed; `tracked` is Server
    /// saying the claiming run settled without answering, which is the one
    /// thing that lifts a claim out of bookkeeping; and not `live` means no run
    /// holds it now, so no reply is coming. Chat says nothing about these by
    /// default — this row is where a person finds out.
    public static func stalledClaims<Item: StalledClaimTask>(in items: [Item]) -> [Item] {
        items.filter { item in
            item.origin == .claimed
                && item.status == .inProgress
                && item.tier == .tracked
                && !item.live
        }
    }

    /// How many items the section would list: every open Ask addressed to this
    /// human, plus the claims an Agent left unfinished. Asks arrive
    /// pre-filtered by Server, so only their number is needed here. Tasks in
    /// review are not counted because the section does not list them: a task is
    /// the Agent's own ledger, and an Ask is the record that addresses a person.
    public static func count<Item: StalledClaimTask>(askCount: Int, tasks: [Item]) -> Int {
        askCount + stalledClaims(in: tasks).count
    }
}
