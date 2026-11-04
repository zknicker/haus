import HausModels
import SwiftUI

/// The claim a message inside a Thread carries, stated on that message.
///
/// An Agent may claim a message in a Thread. That claim works in the Thread it
/// already sits in, so its mark says only which claim and where it stands: no
/// reply count and no way in. It answers to the same Chat preference as an
/// anchor's ingress, so an Agent's claim stays hidden until the reader asks to
/// see claims in Chat, and a claim a human made always shows. The claim the
/// Thread was opened for always shows: it is what the reader asked to see.
struct ThreadClaimMark: View {
    let claim: ClaimPresentation?
    var isOpenedClaim = false
    @AppStorage(ShowClaimsInChat.storageKey) private var showClaimsInChat = false

    var body: some View {
        if let claim = Self.stated(claim, showClaimsInChat: showClaimsInChat, isOpenedClaim: isOpenedClaim) {
            HStack(spacing: 5) {
                TaskStatusDisc(status: TaskStatusShape(claim.status), size: 18)
                Text("Claim #\(claim.number) · \(claim.status.rawValue)").lineLimit(1)
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .padding(.top, 4)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Claim number \(claim.number), \(claim.status.rawValue)")
        }
    }

    /// The claim the mark states, or nil for a claim the reader has not asked
    /// to see.
    nonisolated static func stated(
        _ claim: ClaimPresentation?,
        showClaimsInChat: Bool,
        isOpenedClaim: Bool = false
    ) -> ClaimPresentation? {
        guard let claim,
              isOpenedClaim
              || ClaimVisibility.visibleInChat(origin: claim.origin, showClaimsInChat: showClaimsInChat)
        else { return nil }
        return claim
    }
}
