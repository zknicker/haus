import HausUI
import SwiftUI

/// The app-opening screen: the bare surface that matches the empty launch
/// screen, with the Haus mark at its centre — the one thing on it, drifting, so
/// cold start reads as one quiet held frame rather than a blank one. Still no
/// spinner and no caption: the mark is the wait.
struct HausOpeningView: View {
    var body: some View {
        ZStack {
            Color(uiColor: .systemBackground)
                .ignoresSafeArea()
            HausGhost(fill: .iridescent, animated: true, size: 56)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Opening Haus"))
    }
}

#Preview {
    HausOpeningView()
}
