import HausUI
import SwiftUI

/// The app-opening screen: the launch screen's surface and its ghost, now
/// drifting, so cold start reads as one quiet held frame rather than a white
/// screen popping into a mark. Still no spinner and no caption: the mark is
/// the wait.
///
/// The launch screen (`UILaunchScreen` → `LaunchGhost`) is a still render of
/// this mark at this size on the same system background, centred on the full
/// screen; the ghost here is centred on the full screen too, not the safe
/// area, so the hand-off lands on the same pixels.
struct HausOpeningView: View {
    var body: some View {
        ZStack {
            Color(uiColor: .systemBackground)
            HausGhost(fill: .iridescent, animated: true, size: 56)
        }
        .ignoresSafeArea()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Opening Haus"))
    }
}

#Preview {
    HausOpeningView()
}
