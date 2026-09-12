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
        let anchorMessage = openAsk.threadAnchor
        guard let author = authorPresentation(anchorMessage.author) else { return nil }
        let (body, fenced) = MessagePresentation.resolvedBody(content: anchorMessage.content)
        return ThreadSelection(
            parentChatID: route.chatID,
            threadChatID: openAsk.threadChatID,
            anchor: MessagePresentation(
                id: route.anchorMessageID,
                author: author,
                content: body,
                createdAt: anchorMessage.createdAt,
                attachments: [],
                ask: askPresentation(anchorMessage.body),
                visualBody: fenced
            )
        )
    }
}
