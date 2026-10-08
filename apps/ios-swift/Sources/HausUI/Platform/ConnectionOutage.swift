import SwiftUI

/// How a screen says it has lost Server: the title area reads "Connecting…",
/// the way Messages-style apps put link state in the navigation bar rather
/// than in a banner over the conversation. A stream that drops and comes
/// straight back says nothing; only an outage that outlasts `grace` shows.
/// Sends need no word here either: they land in the transcript at once and
/// replay through the outage on their own.
enum ConnectionOutage {
    static let grace: Duration = .seconds(2)
    static let title = "Connecting…"
}

extension View {
    /// Writes whether the header should read "Connecting…": true once
    /// `isConnected` has stayed false for `ConnectionOutage.grace`, false the
    /// moment it returns.
    func connectionOutage(isConnected: Bool, showsOutage: Binding<Bool>) -> some View {
        task(id: isConnected) {
            guard !isConnected else {
                showsOutage.wrappedValue = false
                return
            }
            try? await Task.sleep(for: ConnectionOutage.grace)
            guard !Task.isCancelled else { return }
            showsOutage.wrappedValue = true
        }
    }
}
