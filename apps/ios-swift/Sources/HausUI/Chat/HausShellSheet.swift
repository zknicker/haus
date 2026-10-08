/// A request to present Settings, optionally already pushed to a screen.
struct SettingsPresentationRequest: Identifiable, Hashable {
    let path: [SettingsRoute]

    var id: String { path.isEmpty ? "settings" : "settings-\(path.hashValue)" }
}

/// The sheets the Chat shell can present over its canvas.
enum HausShellSheet: Identifiable {
    /// `scope` is the Chat search was opened from, which the sheet offers as a
    /// narrower scope; the sidebar opens it unscoped.
    case search(scope: ChatPresentation?)
    case details(ChatDestination)
    case archived
    case newChannel

    var id: String {
        switch self {
        case .search:
            "chat-search"
        case .details(let chat):
            "chat-details-\(chat.id)"
        case .archived:
            "archived-channels"
        case .newChannel:
            "new-channel"
        }
    }
}
