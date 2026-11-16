import Foundation

/// Claims an Agent took and did not finish, which a person finds on that
/// Agent's profile (ADR 0051).
public enum StoppedClaims {
    public static let title = "Stopped before finishing"

    /// Every clause is load-bearing. `claimed` keeps this to an Agent's own
    /// lock; `inProgress` means the work never landed; `tracked` is Server
    /// saying the claiming run settled without answering, which is the one
    /// thing that lifts a claim out of bookkeeping; and not `live` means no run
    /// holds it now, so no reply is coming. Chat says nothing about these by
    /// default — the profile is where a person finds out.
    public static func isStopped(_ claim: MessageClaim) -> Bool {
        claim.origin == .claimed
            && claim.status == .inProgress
            && claim.tier == .tracked
            && !claim.live
    }

    /// One Agent's stopped claims, most recently touched first.
    public static func held(by agentID: String, in items: [ClaimListItem]) -> [ClaimListItem] {
        items
            .filter { $0.claim.assigneeAgentID == agentID && isStopped($0.claim) }
            .sorted { $0.claim.updatedAt > $1.claim.updatedAt }
    }
}
