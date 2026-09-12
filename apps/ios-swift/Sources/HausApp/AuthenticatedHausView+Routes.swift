import HausModels
import HausUI
import SwiftUI

/// How the root stack's routes are opened.
///
/// The Inbox is a push over the Chat canvas rather than the canvas itself. The
/// canvas is what the drawer slides aside, what the Chat selection owns, and
/// what a popped Thread returns to; making it switch between a Chat and a page
/// would have put a second owner on all three. As a push it reuses the Tasks
/// route's shape exactly — and a cold start seeds the stack with it, so the app
/// lands on the Inbox with the restored Chat one Back away.
extension AuthenticatedHausView {
    /// The Inbox page. Every section reads a Store snapshot, so the page adds
    /// no load of its own beyond the gathered refresh it asks for on arrival
    /// and on pull.
    @ViewBuilder
    var inboxDestination: some View {
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
            onRefresh: { await store.loadInbox() }
        )
        .navigationTitle("Inbox")
        .navigationBarTitleDisplayMode(.inline)
    }

    /// A row states a record and opens it where that record is fully readable.
    ///
    /// An Ask and a Cloud Agent work both open the Thread they hang off, which
    /// is the same pair a Thread composer sends to: the conversation's Chat and
    /// the anchor Message. A stalled claim opens the Task list — iOS has no
    /// per-task focus, so the App's deep link to one task has no counterpart
    /// here yet.
    func openInboxRequest(_ request: InboxOpenRequest) {
        switch request {
        case .agent(let agentID):
            openAgentDM(agentID)
        case .ask(let messageID):
            guard let ask = store.openAsks?.first(where: { $0.ask.messageID == messageID })
            else { return }
            pushConversationThread(
                chatID: ask.conversationChatID,
                threadChatID: ask.threadChatID,
                anchor: ask.threadAnchor
            )
        case .chat(let chatID):
            path.removeAll()
            selectedThread = nil
            selectedDestinationID = .chat(chatID)
        case .cloudAgentWork(let messageID):
            guard let work = store.activeCloudAgentWork?
                .first(where: { $0.work.messageId == messageID })
            else { return }
            pushConversationThread(
                chatID: work.conversationChatID,
                threadChatID: work.threadChatID,
                anchor: work.threadAnchor
            )
        case .tasks:
            path.append(.tasks)
        }
    }

    /// A Thread opened from the Inbox pops back to the Inbox, and its parent
    /// Chat may be one the user has never visited — selecting it would mark it
    /// read on the way back out. The route carries the parent Chat id and the
    /// Ask or work carries the child Chat id, so it needs no selection.
    private func pushConversationThread(
        chatID: String,
        threadChatID: String,
        anchor: ChatMessage
    ) {
        guard let author = store.authorPresentation(anchor.author) else { return }
        pushThread(
            ThreadSelection(
                parentChatID: chatID,
                threadChatID: threadChatID,
                anchor: MessagePresentation(
                    id: anchor.id,
                    author: author,
                    content: anchor.content,
                    createdAt: anchor.createdAt
                )
            ),
            selectingParent: nil
        )
    }

    /// An Agent's own Chat is where a person talks to it, so an Agent row lands
    /// on the canvas rather than pushing another screen over the Inbox.
    func openAgentDM(_ agentID: String) {
        guard let destination = store.chatDestinations.agentDestination(agentID: agentID) else {
            return
        }
        path.removeAll()
        selectedThread = nil
        selectedDestinationID = destination.id
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

    private func pushThread(_ thread: ThreadSelection, selectingParent parentChatID: String?) {
        if let parentChatID {
            selectedDestinationID = .chat(parentChatID)
        }
        selectedThread = thread
        path.append(.thread(thread))
    }
}
