import Foundation
import HausModels
import HausUI

/// How an Ask reaches the phone's surfaces: the marker its Message wears, and
/// the Thread its answer is written in.
extension HausStore {
    /// The Ask marker one Message body earns, and nil for every body that is
    /// not an Ask. Names and faces come from the one actor resolver every other
    /// row already reads.
    func askPresentation(_ body: ChatMessageBody?) -> AskPresentation? {
        guard let body else { return nil }
        return AskPresentation.present(body) { agentID, userID in
            actorPresentation(agentID: agentID, userID: userID)
        }
    }

    /// Opening an Ask is opening the Thread its answer goes in. This is the one
    /// entry point a surface that lists open Asks pushes.
    ///
    /// The route carries the conversation's Chat and the Ask's Thread anchor —
    /// `AskAnswerRoute`, the shared `openAskThreadAnchor` rule — so the Thread
    /// composer's ordinary send is already the answer, whether the human types
    /// it or presses one of the offered options.
    func threadSelection(openAsk: OpenAsk) -> ThreadSelection? {
        let route = AskAnswerRoute(openAsk)
        return threadSelection(
            conversationChatID: route.chatID,
            threadChatID: openAsk.threadChatID,
            anchor: openAsk.threadAnchor
        )
    }

    /// The Thread a Server-wide row hangs off, projected from the Message that
    /// row carries rather than from a Chat page.
    ///
    /// A surface that lists records from across the Server — the Inbox — opens
    /// Chats this client has never loaded, so the anchor must arrive fully
    /// projected: an anchor assembled from id, author, and content alone loses
    /// the Ask its body states, and with it the marker and the offered options
    /// the answer Thread exists to show.
    func threadSelection(
        conversationChatID: String,
        threadChatID: String,
        anchor: ChatMessage
    ) -> ThreadSelection? {
        guard let author = authorPresentation(anchor.author) else { return nil }
        let (body, fenced) = MessagePresentation.resolvedBody(content: anchor.content)
        return ThreadSelection(
            parentChatID: conversationChatID,
            threadChatID: threadChatID,
            anchor: MessagePresentation(
                id: anchor.id,
                author: author,
                content: body,
                createdAt: anchor.createdAt,
                attachments: [],
                ask: askPresentation(anchor.body),
                visualBody: fenced
            )
        )
    }
}
