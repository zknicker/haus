import Foundation

public extension HausGhostTempo {
    /// The sidebar's Haus mark always carries the mesh; its drift speed carries
    /// exactly one fact: is anyone working on this Server right now. The
    /// Server's active-activity snapshot is already narrowed to Agents whose
    /// canonical availability is `working`, so a non-empty snapshot is that
    /// fact and nothing here needs to re-derive it.
    ///
    /// An unsettled snapshot reads as calm rather than busy. The mark sits at
    /// the top of every route, so guessing the other way would speed it up and
    /// drop it back on every cold launch, announcing work that never happened.
    ///
    /// Mirrors the App's `resolveAgentActivityGhostTempo`
    /// (`apps/website/src/features/shell/agent-activity-ghost-tempo.ts`).
    static func resolve(isSnapshotReady: Bool, hasWorkingAgent: Bool) -> HausGhostTempo {
        guard isSnapshotReady else { return .calm }
        return hasWorkingAgent ? .lively : .calm
    }
}
