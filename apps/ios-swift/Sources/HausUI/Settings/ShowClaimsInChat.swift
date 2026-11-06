import SwiftUI

/// Whether Chat states the claims Agents take for themselves.
///
/// Per device, like appearance: it is how one reader wants Chat to read, not a
/// fact about the Server, so it lives in `@AppStorage` rather than on a claim
/// record. The key is the App's own (`haus.chat.showClaims`), kept identical so
/// the preference reads as one product setting even though each device stores
/// its own answer. Off unless it is asked for.
public enum ShowClaimsInChat {
    public static let storageKey = "haus.chat.showClaims"
    public static let footer = "Claims agents take for themselves also appear in chat."
}

/// The Preferences row that turns the claims back on. Its explanation is the
/// section footer, `ShowClaimsInChat.footer`.
public struct ShowClaimsInChatRow: View {
    @AppStorage(ShowClaimsInChat.storageKey) private var showClaimsInChat = false

    public init() {}

    public var body: some View {
        SettingsToggleRow(
            "Show claims in chat",
            icon: .tasks,
            isOn: $showClaimsInChat,
            showsDivider: false
        )
    }
}
