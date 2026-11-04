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

/// Tasks and Threads share the root stack, so a Thread opened from a Task pops
/// back to that Task rather than to the canvas underneath. The Inbox is not
/// here: it is the canvas itself, which is why it wears no navigation bar and
/// no Back button — see `AuthenticatedHausView+Routes`.
enum HausRootRoute: Hashable {
    /// The board picker the sidebar opens.
    case tasks
    case board(boardID: String)
    case task(taskID: String)
    case thread(ThreadSelection)

    /// Whether this is one of the screens the sidebar's Tasks row stands for.
    var isTasksRoute: Bool {
        switch self {
        case .tasks, .board, .task: true
        case .thread: false
        }
    }
}

/// A Thread route anchored by the parent message, which exists before the child
/// Chat does.
struct ThreadSelection: Hashable, Identifiable {
    @MainActor
    func resolvedChatID(selectedThread: ThreadSelection?, store: HausStore) -> String? {
        let explicitID = selectedThread?.id == id ? selectedThread?.threadChatID : threadChatID
        return explicitID ?? store.threadChatID(parentChatID: parentChatID, anchorMessageID: anchor.id)
    }

    let parentChatID: String
    var threadChatID: String?
    let anchor: MessagePresentation
    /// The reply whose claim this Thread was opened for
    /// (`ClaimOpening.containingThread`). The Thread lands on it instead of the
    /// unread landing and always marks its claim.
    var claimMessageID: String?

    var id: String { anchor.id }
}

extension Array where Element == HausRootRoute {
    var carriesThread: Bool {
        contains { if case .thread = $0 { true } else { false } }
    }
}
