import SwiftUI

/// A message author's mark: a Captain's squircle, since Captains are never
/// circles, or a person's round avatar, with the presence dot on either.
struct MessageAuthorAvatar: View {
    let author: MessageAuthorPresentation
    let size: CGFloat
    var showsPresence = true

    var body: some View {
        switch author.kind {
        case .captain:
            CaptainAvatarMark(name: author.name, url: author.avatarURL, side: size)
                .overlay(alignment: .bottomTrailing) {
                    if showsPresence, let presence = author.presence {
                        CaptainPresenceDot(presence: presence, side: size)
                    }
                }
                .accessibilityLabel(author.name)
        case .person:
            AvatarView(
                name: author.name,
                url: author.avatarURL,
                presence: showsPresence ? author.presence : nil,
                size: size
            )
        }
    }
}

/// The presence dot on a Captain's squircle, ringed in the canvas like a
/// person's avatar dot.
private struct CaptainPresenceDot: View {
    let presence: AgentPresence
    let side: CGFloat

    var body: some View {
        let dot = min(side * 0.33, 16)
        Circle()
            .fill(presence.color)
            .frame(width: dot, height: dot)
            .overlay { Circle().stroke(HausPlatformColor.canvas, lineWidth: dot > 12 ? 3 : 2) }
            .offset(x: 2, y: 2)
            .accessibilityHidden(true)
    }
}
