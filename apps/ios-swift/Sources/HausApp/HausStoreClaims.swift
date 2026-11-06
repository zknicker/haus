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

    /// Projects a claim row into the shared message presentation the Thread
    /// route uses. Claims are canonical messages, so this must not invent a
    /// second Thread presentation.
    func claimMessagePresentation(_ item: ClaimListItem) -> MessagePresentation? {
        guard let author = authorPresentation(item.message.author) else { return nil }
        return MessagePresentation(
            id: item.message.id,
            author: author,
            content: item.message.content,
            createdAt: item.message.createdAt,
            sequence: item.message.sequence,
            thread: threadPresentation(item.threadSummary),
            claim: claimPresentation(item.claim)
        )
    }
}
