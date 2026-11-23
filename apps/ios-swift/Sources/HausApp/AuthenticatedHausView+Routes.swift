import HausAppModel
import HausModels
import HausUI
import SwiftUI

/// Every open in the app goes through the router; these turn the things views
/// hand back (a Home row, a Chat, a search result, a claim) into routes.
extension AuthenticatedHausView {
    /// A Happening now row opens the Task its Worker runs for.
    func openActiveWorker(workID: String) {
        guard let work = store.activeWorkers?.first(where: { $0.work.id == workID }) else { return }
        switch work.location {
        case .task(_, let taskID):
            router.open(.task(taskID: taskID))
        }
    }

    /// A Chat's route by its kind: Channels open in Projects, DMs in Home, and
    /// a Task's own Chat as its Task.
    func route(forChatID chatID: String, messageID: String? = nil) -> HausRoute {
        if store.chatsByID[chatID] == nil, let taskID = store.taskID(forChatID: chatID) {
            return .task(taskID: taskID, messageID: messageID)
        }
        switch store.chatsByID[chatID]?.kind {
        case .dm?: return .dm(chatID: chatID, messageID: messageID)
        default: return .channel(chatID: chatID, messageID: messageID)
        }
    }

    func route(for destination: ChatDestination) -> HausRoute {
        switch destination.kind {
        case .agentDirectMessage(let agent): .captainDM(agentID: agent.id)
        case .humanDirectMessage: .dm(chatID: destination.pendingKey)
        case .channel: .channel(chatID: destination.pendingKey)
        }
    }

    func conversation(for destination: ChatDestination) -> HausConversation {
        switch destination.id {
        case .chat(let chatID): .chat(chatID)
        case .agentDM(let agentID): .captain(agentID)
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
            memberServerIDs: store.servers.map(\.id)
        )
        guard case .needsSwitch(let serverID) = outcome else { return }
        await switchServer(serverID)
        guard store.activeServer?.id == serverID else { return }
        _ = push.taps.route(into: router, activeServerID: serverID, memberServerIDs: store.servers.map(\.id))
    }

    func switchServer(_ serverID: String) async {
        await store.switchServer(serverID)
        router.adopt(serverID: store.activeServer?.id)
    }
}
