import HausAppModel
import HausModels
import HausUI
import SwiftUI

/// Every open in the app goes through the router; these turn the things views
/// hand back (a Home row, a Chat, a search result, a claim) into routes.
extension AuthenticatedHausView {
    /// A Chat's route by its kind: Channels open in Projects, DMs and Captain
    /// chats in Home, and a Task's own Chat as its Task.
    func route(forChatID chatID: String, messageID: String? = nil) -> HausRoute {
        if store.chatsByID[chatID] == nil, let taskID = store.taskID(forChatID: chatID) {
            return .task(taskID: taskID, messageID: messageID)
        }
        let chat = store.chatsByID[chatID]
        if let captainID = chat?.captainID { return .captain(agentID: captainID, messageID: messageID) }
        switch chat?.kind {
        case .dm?: return .dm(chatID: chatID, messageID: messageID)
        default: return .channel(chatID: chatID, messageID: messageID)
        }
    }

    func route(for destination: ChatDestination) -> HausRoute {
        switch destination.kind {
        case .captainChat(let agent): .captain(agentID: agent.id)
        case .humanDirectMessage: .dm(chatID: destination.pendingKey)
        case .channel: .channel(chatID: destination.pendingKey)
        }
    }

    func conversation(for destination: ChatDestination) -> HausConversation {
        switch destination.id {
        case .chat(let chatID): .chat(chatID)
        case .captain(let agentID): .captain(agentID)
        }
    }

    func destination(for conversation: HausConversation) -> ChatDestination? {
        switch conversation {
        case .chat(let chatID): store.chatDestinations.first { $0.id == .chat(chatID) }
        case .captain(let agentID): store.chatDestinations.agentDestination(agentID: agentID)
        case .task: nil
        }
    }

    func openClaim(_ item: ClaimListItem) {
        router.open(route(forChatID: item.claim.chatID, messageID: item.claim.messageID), from: .outside)
    }

    /// A push tap: switch Servers first when it is for another one, then route,
    /// and consume it only once it has routed.
    func routePendingPush() async {
        let outcome = push.taps.route(
            into: router,
            activeServerID: store.activeServer?.id,
            memberServerIDs: store.servers.map(\.id),
            captainOf: { store.chatsByID[$0]?.captainID }
        )
        guard case .needsSwitch(let serverID) = outcome else { return }
        await switchServer(serverID)
        guard store.activeServer?.id == serverID else { return }
        _ = push.taps.route(
            into: router,
            activeServerID: serverID,
            memberServerIDs: store.servers.map(\.id),
            captainOf: { store.chatsByID[$0]?.captainID }
        )
    }

    func switchServer(_ serverID: String) async {
        await store.switchServer(serverID)
        router.adopt(serverID: store.activeServer?.id)
    }
}
