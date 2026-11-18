import HausModels
import SwiftUI

/// The claim a message carries, stated under that message.
///
/// The claim is the Agent's lock on a message (ADR 0052 decision 5), not a
/// place, so its mark says only which claim and where it stands. An Agent's
/// claim stays hidden until the reader asks to see claims in Chat; a claim a
/// human made always shows.
struct MessageClaimMark: View {
    let claim: ClaimPresentation?
    @AppStorage(ShowClaimsInChat.storageKey) private var showClaimsInChat = false

    var body: some View {
        if let claim = Self.stated(claim, showClaimsInChat: showClaimsInChat) {
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
    nonisolated static func stated(_ claim: ClaimPresentation?, showClaimsInChat: Bool) -> ClaimPresentation? {
        guard let claim,
              ClaimVisibility.visibleInChat(origin: claim.origin, showClaimsInChat: showClaimsInChat)
        else { return nil }
        return claim
    }
}
