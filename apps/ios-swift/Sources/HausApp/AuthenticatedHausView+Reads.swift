import HausAppModel
import HausUI
import SwiftUI

/// Read acknowledgement and push suppression follow the router: only the
/// selected tab's top route is on screen, so only its Chat may mark read or
/// hold back a banner (specs/ios-app.md, Server lifecycle). A Chat mounted
/// lower in a stack, or in another tab, reports its viewport but never
/// acknowledges, because the Store gates reads on `openChatID`.
extension AuthenticatedHausView {
    var visibleChatID: String? {
        router.visibleConversation?.chatID(
            captainChat: { store.chatDestinations.agentDestination(agentID: $0)?.durableChat?.id },
            taskChat: viewingTaskChatID
        )
    }

    func showVisibleChat(_ chatID: String?) async {
        push.viewingChatID = chatID
        store.canvasChatID = chatID
        guard let chatID else {
            store.openChatID = nil
            return
        }
        await push.clearDelivered(openedChatID: chatID)
        await store.openChat(chatID: chatID)
    }

    func reportVisibleMessages(_ destination: ChatDestination, _ messageIDs: [String]) {
        guard case .chat(let chatID) = destination.id else { return }
        store.reportVisibleMessages(chatID: chatID, messageIDs: messageIDs)
    }

    /// Reads follow attention, so the acknowledgement gate is the app being
    /// frontmost. Returning to active re-evaluates the open Chat.
    func applyReadForeground(_ phase: ScenePhase) {
        Task { await store.setForegrounded(phase == .active) }
    }
}
