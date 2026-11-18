import Foundation
import HausModels
import HausUI

/// The one claim read left on the phone: an Agent profile's stopped claims.
/// Claims have no list of their own, so this is one `claim.list` per profile
/// opened, sliced to that Agent, rather than a snapshot events keep fresh.
extension HausStore {
    func agentStoppedClaims(
        open: @escaping @MainActor @Sendable (ClaimListItem) -> Void
    ) -> AgentStoppedClaimsActions {
        AgentStoppedClaimsActions(
            load: { [weak self] agentID in
                guard let self else { throw CancellationError() }
                return try await stoppedClaims(agentID: agentID)
            },
            open: open
        )
    }

    private func stoppedClaims(agentID: String) async throws -> [ClaimListItem] {
        let list: ClaimList = try await client.query(
            "claim.list",
            input: ServerScopedInput(serverId: try activeServerID())
        )
        return StoppedClaims.held(by: agentID, in: list.claims)
    }
}
