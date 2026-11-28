import HausAppModel
import HausUI
import SwiftUI

/// Read acknowledgement and push suppression follow the router: only the
/// Chats on screen (the selected tab's top route, and beside a Task the
/// conversation under it) may mark read or hold back a banner
/// (specs/ios-app.md, Server lifecycle). A Chat mounted lower in a stack, or
/// in another tab, reports its viewport but never acknowledges, because the
/// Store gates reads on `openChatIDs`.
extension AuthenticatedHausView {
    var visibleChatIDs: Set<String> {
        Set(router.visibleConversations.compactMap { conversation in
            conversation.chatID(
                captainChat: { store.chatDestinations.agentDestination(agentID: $0)?.durableChat?.id },
                taskChat: viewingTaskChatID
            )
        })
    }

    func showVisibleChats(_ chatIDs: Set<String>) async {
        push.viewingChatIDs = chatIDs
        store.openChatIDs = chatIDs
        await push.clearDelivered(openedChatIDs: chatIDs)
        for chatID in chatIDs.sorted() {
            await store.openChat(chatID: chatID)
        }
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
