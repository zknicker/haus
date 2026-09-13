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
/// of them. Tasks and Threads stay pushes over whichever is showing.
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
            needsYou: store.inboxNeedsYouRows,
            conversations: store.inboxConversationRows,
            cloudAgentWork: store.activeCloudAgentWork,
            workingAgents: store.inboxWorkingAgents,
            resolveActor: { agentID, userID in
                store.actorPresentation(agentID: agentID, userID: userID)
            },
            onOpen: openInboxRequest,
            onRefresh: { await store.loadInbox() },
            onOpenSidebar: onOpenSidebar,
            contentInsets: contentInsets
        )
    }

    /// The sidebar's Inbox row: the canvas goes back to the Inbox, and anything
    /// pushed over it comes off.
    func openInbox() {
        path.removeAll()
        selectedThread = nil
        showsInboxCanvas = true
    }

    /// A row states a record and opens it where that record is fully readable.
    ///
    /// An Ask and a Cloud Agent work both open the Thread they hang off, which
    /// is the same pair a Thread composer sends to: the conversation's Chat and
    /// the anchor Message. A stalled claim opens the Task list on its own task,
    /// the phone's counterpart of the App's `?task=` deep link.
    func openInboxRequest(_ request: InboxOpenRequest) {
        switch request {
        case .agent(let agentID):
            openAgentDM(agentID)
        case .ask(let messageID):
            guard let ask = store.openAsks?.first(where: { $0.ask.messageID == messageID }),
                  let selection = store.threadSelection(openAsk: ask)
            else { return }
            pushConversationThread(selection)
        case .chat(let chatID):
            openCanvasChat(.chat(chatID))
        case .cloudAgentWork(let messageID):
            guard let work = store.activeCloudAgentWork?
                .first(where: { $0.work.messageId == messageID }),
                let selection = store.threadSelection(
                    conversationChatID: work.conversationChatID,
                    threadChatID: work.threadChatID,
                    anchor: work.threadAnchor
                )
            else { return }
            pushConversationThread(selection)
        case .tasks(let focus):
            path.append(.tasks(focus: focus))
        }
    }

    /// A Thread opened from the Inbox pops back to the Inbox, and its parent
    /// Chat may be one the user has never visited — selecting it would mark it
    /// read on the way back out. The route carries the parent Chat id and the
    /// Ask or work carries the child Chat id, so it needs no selection.
    ///
    /// The Store projects the anchor, because the Inbox is the one surface that
    /// opens a Thread over a Chat page this client has not loaded: the Thread
    /// screen has nothing to fall back to, so what the row hands it is all it
    /// will ever have — the Ask marker and its offered options included.
    private func pushConversationThread(_ selection: ThreadSelection) {
        pushThread(selection, selectingParent: nil)
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
    func openCanvasChat(_ id: ChatDestination.ID) {
        path.removeAll()
        selectedThread = nil
        showsInboxCanvas = false
        selectedDestinationID = id
    }

    /// A Thread opened from the canvas pops back to the canvas, so the canvas
    /// underneath has to be its parent Chat.
    func openThread(_ chat: ChatPresentation, _ anchor: MessagePresentation) {
        pushThread(
            ThreadSelection(
                parentChatID: chat.id,
                threadChatID: anchor.thread?.threadChatID,
                anchor: anchor
            ),
            selectingParent: chat.id
        )
    }

    /// A Thread opened from the Tasks list pops back to the Tasks list, and the
    /// Task's parent Chat may be one the user has never visited. Selecting it
    /// would mark it read on the way back out and strand the user in it once the
    /// Tasks list pops, so this route leaves the canvas selection alone. The
    /// Thread needs no selection of its own: its route carries the parent Chat
    /// id and the Task carries the child Chat id.
    func openTask(_ item: TaskListItem) {
        guard let anchor = store.taskMessagePresentation(item) else { return }
        pushThread(
            ThreadSelection(
                parentChatID: item.message.chatID,
                threadChatID: item.task.threadChatID,
                anchor: anchor
            ),
            selectingParent: nil
        )
    }

    /// Every Thread push, whichever row opened it. The viewer's open Asks are
    /// pulled in here because the Thread screen offers the newest open Ask in
    /// the Thread — which may be a reply rather than the anchor, and a reply's
    /// Ask is not in anything the route carries. The Inbox has usually already
    /// landed this read; a Thread opened from a Chat or a Task has not.
    private func pushThread(_ thread: ThreadSelection, selectingParent parentChatID: String?) {
        if store.openAsks == nil {
            Task { await store.loadOpenAsks() }
        }
        if let parentChatID {
            selectedDestinationID = .chat(parentChatID)
        }
        selectedThread = thread
        path.append(.thread(thread))
    }
}
