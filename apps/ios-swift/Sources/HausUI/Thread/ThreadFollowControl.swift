import SwiftUI

/// A Thread's follow state and the one mutation its screen can ask for.
///
/// `nil` on the screen means the Thread has no Server row yet — a first reply
/// creates it — so there is nothing to follow and the control stays away.
public struct ThreadFollow {
    public let followed: Bool
    public let setFollow: (Bool) async -> Void

    public init(followed: Bool, setFollow: @escaping (Bool) async -> Void) {
        self.followed = followed
        self.setFollow = setFollow
    }
}

/// The words and the mark the follow control wears, mirroring the App's Thread
/// header item: both state what a press will do, not what the state is.
public struct ThreadFollowPresentation: Equatable, Sendable {
    public let title: String
    public let icon: HausIconName
    /// What a press asks Server for.
    public let nextFollow: Bool

    public static func make(followed: Bool) -> ThreadFollowPresentation {
        ThreadFollowPresentation(
            title: followed ? "Stop following thread" : "Follow thread",
            icon: followed ? .notificationOff : .notification,
            nextFollow: !followed
        )
    }
}

/// The Thread screen's follow control, on the navigation bar's trailing rail.
///
/// The App carries the same action inside the Thread header's name dropdown,
/// where two other actions keep it company. A pushed phone screen has no such
/// menu, so the action is the bar item itself and the system draws the glass.
public struct ThreadFollowControl: View {
    private let follow: ThreadFollow

    /// A press is in flight until Server answers, exactly as the App's item
    /// disables itself while its mutation is pending.
    @State private var isPending = false

    public init(follow: ThreadFollow) {
        self.follow = follow
    }

    public var body: some View {
        let presentation = ThreadFollowPresentation.make(followed: follow.followed)

        Button {
            guard !isPending else { return }
            isPending = true
            Task { @MainActor in
                await follow.setFollow(presentation.nextFollow)
                isPending = false
            }
        } label: {
            HausIcon(presentation.icon, size: 19, weight: GlassChromeButton.iconGlyphWeight)
        }
        // Chrome reads in label colour, like the back chevron on the same rail.
        .foregroundStyle(HausPlatformColor.label)
        .disabled(isPending)
        .accessibilityLabel(presentation.title)
    }
}

#Preview {
    NavigationStack {
        Text("Thread")
            .navigationTitle("Thread")
            .hausInlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .automatic) {
                    ThreadFollowControl(follow: ThreadFollow(followed: true) { _ in })
                }
            }
    }
}
