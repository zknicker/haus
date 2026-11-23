import SwiftUI

/// A profile's photo, name, and handle. A Captain, which carries a presence,
/// shows its rounded square; a person keeps the circle.
struct ProfileHero: View {
    let initials: String
    let avatarURL: URL?
    var presence: AgentPresence? = nil
    let displayName: String
    let handle: String?
    let onSaveAvatar: @Sendable (AvatarImagePayload) async throws -> Void

    private static let side: CGFloat = 84

    var body: some View {
        VStack(spacing: 8) {
            ZStack(alignment: .bottomTrailing) {
                if let presence {
                    CaptainMark(name: displayName, side: Self.side, isWorking: presence == .working) {
                        AvatarView(name: displayName, url: avatarURL, initials: initials, size: Self.side * 2.squareRoot())
                    }
                } else {
                    AvatarView(name: displayName, url: avatarURL, initials: initials, size: Self.side)
                }
                AvatarPhotoPicker(onImagePicked: onSaveAvatar)
                    .offset(x: 4, y: 4)
            }
            Text(displayName)
                .font(.title2.weight(.semibold))
                .foregroundStyle(.primary)
                .multilineTextAlignment(.center)
            if let handle {
                Text(handle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .accessibilityElement(children: .combine)
    }
}
