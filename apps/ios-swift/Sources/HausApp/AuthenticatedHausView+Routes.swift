import HausModels
import HausUI
import SwiftUI

/// How the root canvas and the root stack's routes are opened.
///
/// The Inbox is the canvas the app lands on, not a screen pushed over one: a
/// landing screen with a navigation title and a Back chevron claims there is
/// somewhere behind it, and on a cold start there is not. The Chat canvas and
/// the Inbox therefore take turns in the one canvas slot, and the drawer —
/// its toggle, its veil, its pan — belongs to the slot rather than to either
extension AuthenticatedHausView {
    /// The Inbox page. Every section reads a Store snapshot, so the page adds
    /// no load of its own beyond the gathered refresh it asks for on arrival
    /// and on pull.
    @ViewBuilder
    func inboxCanvas(
        contentInsets: EdgeInsets,
        onOpenSidebar: @escaping () -> Void
    ) -> some View {
        InboxPageView(
            greetingName: store.inboxGreetingName,
            agentWeeks: store.inboxAgentWeeks(),
            unread: store.inboxUnreadRows,
            cloudAgentWork: store.activeCloudAgentWork,
            workingAgents: store.inboxWorkingAgents,
            resolveActor: { agentID, userID in
                store.actorPresentation(agentID: agentID, userID: userID)
            },
            onOpen: openInboxRequest,
            onMarkRead: { rowID in
                Task { await store.markInboxRowRead(id: rowID) }
            },
            onRefresh: { await store.loadInbox() },
            onOpenSidebar: onOpenSidebar,
            contentInsets: contentInsets
        )
    }

    /// The sidebar's Inbox row: the canvas goes back to the Inbox, and anything
    /// pushed over it comes off.
    func openInbox() {
        path.removeAll()
        showsInboxCanvas = true
    }

    func openInboxRequest(_ request: InboxOpenRequest) {
        switch request {
        case .agent(let agentID):
            openAgentDM(agentID)
        case .chat(let chatID):
            openCanvasChat(.chat(chatID))
        case .cloudAgentWork(let workID):
            guard let work = store.activeCloudAgentWork?.first(where: { $0.work.id == workID }) else { return }
            openCloudAgentWork(work)
        case .task(let taskID):
            openTask(taskID)
        }
    }

    private func openCloudAgentWork(_ work: ActiveCloudAgentWork) {
        if let taskID = work.taskID {
            openTask(taskID)
            return
        }
        switch work.location {
        case .message(let chatID, let messageID):
            openCanvasChat(.chat(chatID), revealing: messageID)
        }
    }

    func openPushNotification(_ payload: PushNotificationPayload) async {
        guard payload.serverID == store.activeServer?.id else {
            PushNotifications.logger.notice("Ignoring a notification for another Server.")
            return
        }
        switch payload.route {
        case .chat(let chatID):
            openCanvasChat(.chat(chatID))
        case .task(let taskID, _):
            path.removeAll()
            openTask(taskID)
        }
    }

    /// An Agent's own Chat is where a person talks to it, so an Agent row lands
    /// on the canvas rather than pushing another screen over the Inbox.
    func openAgentDM(_ agentID: String) {
        guard let destination = store.chatDestinations.agentDestination(agentID: agentID) else {
            return
        }
        openCanvasChat(destination.id)
    }

    /// The one way a route puts a Chat on the canvas: everything covering the
    /// canvas comes off, and the Inbox stops being what it shows.
    func openCanvasChat(_ id: ChatDestination.ID, revealing messageID: String? = nil) {
        path.removeAll()
        showsInboxCanvas = false
        canvasScrollTarget = if case .chat(let chatID) = id, let messageID {
            MessageScrollTarget(chatID: chatID, messageID: messageID)
        } else {
            nil
        }
        selectedDestinationID = id
        canvasRouteRevision += 1
    }

    func openClaim(_ item: ClaimListItem) {
        openCanvasChat(.chat(item.claim.chatID), revealing: item.claim.messageID)
    }
}
