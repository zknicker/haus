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

/// Inbox, Tasks, and Threads share the root stack, so a Thread opened from a
/// Task pops back to the Task list rather than to the Chat canvas, and an Ask
/// opened from the Inbox pops back to the Inbox.
///
/// The Inbox is a push over the Chat canvas rather than the canvas itself. The
/// canvas is what the drawer slides aside, what the Chat selection owns, and
/// what a Thread pops back to; making it switch between a Chat and a page would
/// have put a second owner on all three. A cold start seeds this stack with the
/// Inbox, so the app lands there with the restored Chat one Back away.
enum HausRootRoute: Hashable {
    case inbox
    case tasks
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
