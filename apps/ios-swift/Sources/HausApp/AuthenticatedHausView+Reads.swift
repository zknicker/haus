import HausUI
import SwiftUI

/// Read acknowledgement's App-side wiring.
///
/// The phone follows the web App's rule: a message is read when it has been in
/// the viewport, not when its page loaded. The transcripts report what they are
/// showing, the Store's `ChatReadLedger` decides what that is worth, and these
/// three hooks are the whole seam between them.
extension AuthenticatedHausView {
    /// The Chat the canvas has to have open, and the only one that
    var canvasOpenChatID: String? {
        ChatCanvasOpen.chatID(
            selectedID: selectedDestinationID,
            isCovered: showsInboxCanvas || !path.isEmpty
        )
    }

    /// The Chat on screen right now, for deciding whether a foreground push
    var viewingChatID: String? {
        switch path.last {
        case .task(let taskID):
            viewingTaskChatID(taskID)
        case nil:
            canvasOpenChatID
        }
    }

    /// The Chat the canvas is showing, covered or not. It is what a pop lands
    /// on, so the Store keeps its page fresh even while it is off screen.
    var selectedCanvasChatID: String? {
        ChatCanvasOpen.canvasChatID(selectedID: selectedDestinationID)
    }

    /// The canvas Chat's viewport. Nothing reports while the Inbox covers the
    /// canvas, because the Inbox replaces the Chat screen rather than sitting
    /// over it — the covering rule is structural, not a guard.
    func reportVisibleMessages(_ destination: ChatDestination, _ messageIDs: [String]) {
        guard case .chat(let chatID) = destination.id else { return }
        store.reportVisibleMessages(chatID: chatID, messageIDs: messageIDs)
    }

    /// Reads follow attention, so the acknowledgement gate is the app being
    /// frontmost — the same rule the web App's `useAppForegrounded` states with
    /// document visibility and window focus. Returning to active re-evaluates
    /// the open Chat's current high-water mark.
    func applyReadForeground(_ phase: ScenePhase) {
        Task { await store.setForegrounded(phase == .active) }
    }
}
