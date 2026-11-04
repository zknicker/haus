import Foundation
import HausModels
import HausUI
import OSLog

/// Server-backed claim reads and lifecycle mutations for native claim lenses.
///
/// The store intentionally returns authoritative projections instead of
/// maintaining a second claim cache. A parent surface can keep the returned
/// snapshot in its own view state and replace it after each mutation.
extension HausStore {
    /// The claims a lens shows. The default lens is the tracked tier alone;
    /// `includeBackground` widens it to the bookkeeping claims an Agent settles
    /// inside one turn.
    ///
    /// The Server-wide default lens also records how many claims it hid, so a
    /// surface can say "N background" without a second round trip. Every other
    /// read leaves that count alone (`TaskBackgroundLens.recordsHiddenCount`):
    /// a Chat-scoped read answers a different question, and a widened read
    /// hides nothing and so reports zero — recording that would take the
    /// number off the one control that leads back out of the widened lens.
    func loadClaims(
        chatID: String? = nil,
        includeBackground: Bool = false
    ) async throws -> [ClaimListItem] {
        guard let serverID = activeServer?.id else {
            throw HausStoreError.serverUnavailable
        }
        let list: ClaimList = try await client.query(
            "claim.list",
            input: ClaimListInput(
                serverID: serverID,
                chatID: chatID,
                includeBackground: includeBackground ? true : nil
            )
        )
        if TaskBackgroundLens.recordsHiddenCount(chatID: chatID, includeBackground: includeBackground),
           claimBackgroundCount != list.backgroundCount {
            claimBackgroundCount = list.backgroundCount
        }
        return list.claims
    }

    /// Reloads the lens a claim surface is showing.
    ///
    /// The default lens is the Server-wide read the Store already owns, so it
    /// lands on that one snapshot and every surface reading it repaints. The
    /// widened lens is one reader's temporary question, so it is only returned.
    func reloadClaimLens(includeBackground: Bool) async throws -> [ClaimListItem] {
        if includeBackground {
            return try await loadClaims(includeBackground: true)
        }
        let rows = try await loadClaims()
        if serverClaims != rows { serverClaims = rows }
        return rows
    }

    /// Refreshes the Server-wide default claim lens the Tasks list stands on.
    func loadServerClaims() async {
        guard let serverID = activeServer?.id else { return }
        let readStart = realtimeReconciliation.beginRead()
        do {
            let claims = try await loadClaims()
            guard activeServer?.id == serverID,
                  realtimeReconciliation.landed(.claimLenses, readStartedAt: readStart)
            else { return }
            if serverClaims != claims { serverClaims = claims }
        } catch {
            Self.logger.error("Loading server claims failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    @discardableResult
    func updateClaimStatus(_ claim: MessageClaim, status: ClaimStatus) async throws -> MessageClaim {
        guard let serverID = activeServer?.id else {
            throw HausStoreError.serverUnavailable
        }
        let receipt: ClaimMutationReceipt = try await client.mutation(
            "claim.update",
            input: ClaimUpdateInput(
                serverID: serverID,
                messageID: claim.messageID,
                expectedVersion: claim.version,
                patch: ClaimUpdatePatch(status: status)
            )
        )
        return receipt.claim
    }
}
