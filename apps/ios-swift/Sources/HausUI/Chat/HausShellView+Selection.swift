import SwiftUI

/// Which Chat the canvas shows, and every path that changes it.
extension HausShellView {
    var durableChats: [ChatPresentation] {
        destinations.compactMap(\.durableChat)
    }

    var selectedDestination: ChatDestination? {
        destinations.first { $0.id == selectedDestinationID } ?? destinations.first
    }

    /// Adopts a requested durable Chat once the Server list carries it, while
    /// implicit Agent destinations remain selectable without a Chat id. Also the
    /// one place a destination is observed to have left, which is where its
    /// composer state — draft and staged files alike — stops being worth keeping.
    func syncSelection(destinationIDs: [ChatDestination.ID]) {
        dropCanvasState(outside: destinationIDs)

        if let pendingID = pendingChatSelectionID,
           let arrived = destinations.first(where: { $0.id == .chat(pendingID) }) {
            pendingChatSelectionID = nil
            selectDestination(arrived)
            return
        }

        guard let selectedDestinationID, destinationIDs.contains(selectedDestinationID) else {
            self.selectedDestinationID = destinationIDs.first
            return
        }
    }

    /// The sidebar's Inbox row. Unlike Settings and Tasks, which present a
    /// surface over the open drawer, this one only swaps what the canvas draws
    /// — so it closes the drawer the way selecting a Chat does, and for the
    /// same two reasons: the veil cuts rather than dissolving over a canvas
    /// that was never behind it, and the slide waits a turn so the page is
    /// mounted before it moves.
    func openInboxCanvas() {
        if !showsInbox { drawer.close = .chatSelection }
        onOpenInbox()
        Task { @MainActor [drawer] in drawer.set(open: false) }
    }

    func selectDestination(_ destination: ChatDestination) {
        if case .chat(let chatID) = destination.id, pendingChatSelectionID != chatID {
            pendingChatSelectionID = nil
        }
        // The veil and the new screen commit together, in one unanimated turn.
        // Both changes land in the same update, so the veil is removed with no
        // transaction to animate it — a hard cut in the frame the incoming Chat
        // mounts, leaving the slide to be the whole transition. Deferring the
        // veil to the closing spring instead dissolved it over a Chat that was
        // never behind it, which is the fade this replaces. Re-selecting the
        // Chat already on the canvas mounts nothing, so that close keeps the
        // interactive fade like any other close over an unchanged Chat.
        if destination.id != selectedDestination?.id || showsInbox {
            drawer.close = .chatSelection
            // An open drawer's snap is this switch's tick; a switch from a
            // sheet or a route has no snap, so it ticks on its own.
            if !drawer.isPresented { chatSwitchFeedback += 1 }
        }
        // Selecting a Chat is what takes the canvas off the Inbox; every other
        // way back to it is the App's.
        showsInbox = false
        selectedDestinationID = destination.id
        // The swap and the slide land in two steps. This selection reaches the
        // canvas's hosting controller in the shell's next update, after this
        // call returns; closing here would start the slide over the outgoing
        // screen and show a blank canvas for the frame the new one mounts. The
        // hop runs after that update, and the container lays the new screen
        // out before its first animation frame (`HausDrawerController.settle`).
        Task { @MainActor [drawer] in drawer.set(open: false) }
    }

    /// Opens one Agent's Chat, which is where the phone shows an Agent profile:
    /// the Chat's details sheet pushes the profile of the Agent it is a Chat
    /// with. Every Agent carries a destination — durable, receipt-backed, or
    /// implicit — so this resolves for any Agent the Server still reports, and
    /// stands down for one it no longer does.
    func openAgent(_ agentID: String) {
        guard let destination = destinations.agentDestination(agentID: agentID) else { return }
        activeChatSheet = nil
        selectDestination(destination)
    }

    /// The one path a sheet uses to reach a Chat, so every sheet dismisses and
    /// selects in the same order.
    func open(_ chat: ChatPresentation, revealing messageID: String? = nil) {
        activeChatSheet = nil
        scrollTarget = messageID.map { MessageScrollTarget(chatID: chat.id, messageID: $0) }
        selectDestination(.durableChat(chat))
    }

    func openSearchResult(_ result: MessageSearchResultPresentation) -> Bool {
        guard let chat = durableChats.first(where: { $0.id == result.chatID }) else { return false }
        open(chat, revealing: result.id)
        return true
    }
}
