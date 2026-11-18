import HausUI
import SwiftUI

/// The settings sheet's fallback when Server settings data has not loaded yet.
struct SettingsUnavailableSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ContentUnavailableView {
                Label("Settings unavailable", systemImage: "gearshape")
            } description: {
                Text("Settings are still loading. Try again in a moment.")
            }
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

/// The root stack's pushed routes. The Inbox is not here: it is the canvas
/// itself, which is why it wears no navigation bar and no Back button — see
/// `AuthenticatedHausView+Routes`.
enum HausRootRoute: Hashable {
    case task(taskID: String)
}
