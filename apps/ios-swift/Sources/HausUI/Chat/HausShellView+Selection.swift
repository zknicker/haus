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
    /// that was never behind it, and the slide waits a turn so the page
    /// mounting inside it is not pinned at the closed position.
    func openInboxCanvas() {
        if !showsInbox { drawerClose = .chatSelection }
        onOpenInbox()
        Task { @MainActor in setDrawer(open: false) }
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
        if destination.id != selectedDestination?.id {
            drawerClose = .chatSelection
        }
        // Selecting a Chat is what takes the canvas off the Inbox; every other
        // way back to it is the App's.
        showsInbox = false
        selectedDestinationID = destination.id
        // The swap and the slide are two events, and they have to land in two
        // frames. The canvas is keyed by destination, so this selection inserts
        // a new Chat screen — and SwiftUI places a view inserted *inside* an
        // animating transaction at that animation's destination, not at its
        // in-flight geometry. Closing the drawer in the same turn therefore
        // pinned the incoming Chat at the closed position while the canvas
        // frame slid over it: a wipe across a stationary transcript rather than
        // the Chat travelling with the drawer. SwiftUI merges every mutation
        // made in one turn into a single transaction, so the two can only be
        // separated by a turn: this hop is enqueued before the update that
        // mounts the screen and runs at the first main-actor drain after it,
        // which is the earliest a spring can start without sharing that
        // transaction. The hold is therefore one frame plus the new screen's
        // first layout, and cannot go below one frame.
        Task { @MainActor in setDrawer(open: false) }
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
