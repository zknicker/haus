import Foundation

/// The only claim fields the Tasks list's grouping depends on.
public protocol ClaimListGroupable {
    var live: Bool { get }
    var origin: ClaimOrigin { get }
    var status: ClaimStatus { get }
    var tier: ClaimTier { get }
}

extension MessageClaim: ClaimListGroupable {}

extension ClaimListItem: ClaimListGroupable {
    public var live: Bool { claim.live }
    public var origin: ClaimOrigin { claim.origin }
    public var status: ClaimStatus { claim.status }
    public var tier: ClaimTier { claim.tier }
}

/// One group of the Tasks list, in the App's List order: what waits on a
/// person leads, then claims an Agent dropped, then the lifecycle.
public enum ClaimListGroup: Hashable, Sendable {
    /// `in_review`: the only kind of claim a reader can finish by looking at it.
    case needsReview
    /// A claim an Agent took and stopped short of finishing.
    case stoppedBeforeFinishing
    case status(ClaimStatus)

    public static let ordered: [ClaimListGroup] = [
        .needsReview,
        .stoppedBeforeFinishing,
        .status(.todo),
        .status(.inProgress),
        .status(.done),
        .status(.closed),
    ]

    public var title: String {
        switch self {
        case .needsReview: "Needs your review"
        case .stoppedBeforeFinishing: "Stopped before finishing"
        case .status(let status): status.displayName
        }
    }

    public static func of(_ item: some ClaimListGroupable) -> ClaimListGroup {
        if item.status == .inReview { return .needsReview }
        if isStoppedBeforeFinishing(item) { return .stoppedBeforeFinishing }
        return .status(item.status)
    }

    /// A claim an Agent took and did not finish (ADR 0037).
    ///
    /// Every clause is load-bearing. `claimed` keeps this to an Agent's own
    /// lock; `inProgress` means the work never landed; `tracked` is Server
    /// saying the claiming run settled without answering, which is the one
    /// thing that lifts a claim out of bookkeeping; and not `live` means no run
    /// holds it now, so no reply is coming. Chat says nothing about these by
    /// default — this group is where a person finds out.
    public static func isStoppedBeforeFinishing(_ item: some ClaimListGroupable) -> Bool {
        item.origin == .claimed
            && item.status == .inProgress
            && item.tier == .tracked
            && !item.live
    }

    /// The non-empty groups in List order, each keeping the rows' own order.
    public static func grouped<Item: ClaimListGroupable>(
        _ items: [Item]
    ) -> [(group: ClaimListGroup, items: [Item])] {
        ordered.compactMap { group in
            let members = items.filter { of($0) == group }
            return members.isEmpty ? nil : (group: group, items: members)
        }
    }
}
