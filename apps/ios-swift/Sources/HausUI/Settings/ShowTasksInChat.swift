import SwiftUI

/// Whether Chat states the tasks Agents claim for themselves.
///
/// Per device, like appearance: it is how one reader wants Chat to read, not a
/// fact about the Server, so it lives in `@AppStorage` rather than on a task
/// record. The key is the App's own (`haus.chat.showTasks`), kept identical so
/// the preference reads as one product setting even though each device stores
/// its own answer. Off unless it is asked for.
public enum ShowTasksInChat {
    public static let storageKey = "haus.chat.showTasks"
    public static let footer = "Tasks agents claim for themselves also appear in chat."
}

/// The Preferences row that turns the claims back on. Its explanation is the
/// section footer, `ShowTasksInChat.footer`.
public struct ShowTasksInChatRow: View {
    @AppStorage(ShowTasksInChat.storageKey) private var showTasksInChat = false

    public init() {}

    public var body: some View {
        SettingsToggleRow(
            "Show tasks in chat",
            icon: .tasks,
            isOn: $showTasksInChat,
            showsDivider: false
        )
    }
}
