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
/// back to the Task list rather than to the canvas underneath. The Inbox is not
/// here: it is the canvas itself, which is why it wears no navigation bar and
/// no Back button — see `AuthenticatedHausView+Routes`.
enum HausRootRoute: Hashable {
    /// The Task list, landing on one task when the route names one. The
    /// sidebar's own row names none; a stalled-claim Inbox row names the task
    /// it is about, which is the phone's counterpart of the App's `?task=`.
    case tasks(focus: TaskFocus?)
    case thread(ThreadSelection)
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

    var id: String { anchor.id }
}

extension Array where Element == HausRootRoute {
    var carriesThread: Bool {
        contains { if case .thread = $0 { true } else { false } }
    }
}
