import Foundation
import HausModels

/// Which Ask a Thread screen offers options for.
///
/// An Agent can ask inside a Thread as easily as it can start one, so the Ask
/// waiting on the reader is not always the anchor: `haus ask` posted as a reply
/// leaves the anchor settled — or never an Ask at all — while the open decision
/// sits further down the transcript. The screen therefore offers the **newest
/// open Ask in this Thread**, anchor or reply alike. Newest, because an Agent
/// that asked twice is waiting on the second question; one Thread, because the
/// answer is a reply into this anchor and nowhere else.
///
/// Answering is unchanged: pressing an option sends an ordinary Thread reply
/// carrying that text, addressed to the conversation Chat and this anchor
/// (`AskAnswerRoute`), and Server settles whichever Ask the reply answers.
enum ThreadAskOptions {
    /// The Ask whose options belong above this Thread's composer, or nil when
    /// nothing here is waiting on the reader.
    ///
    /// `openAsks` is the viewer's Server-wide snapshot; nil is a read that has
    /// not landed, and until it does the anchor's own open Ask stands in, so a
    /// Thread opened straight onto an Ask never blinks its options on. An Ask
    /// belongs to this Thread when its answer anchor is this anchor — Server
    /// projects a Thread Ask's `threadAnchorMessage` as the Thread's anchor and
    /// a top-level Ask's as its own Message, so the one comparison covers both.
    static func offered(openAsks: [OpenAsk]?, anchor: MessagePresentation) -> ThreadAskOffer? {
        if let newest = newestOpenAsk(openAsks, anchorMessageID: anchor.id) {
            return ThreadAskOffer(
                id: newest.ask.messageID,
                options: AskOptions(newest.ask.options)
            )
        }
        guard let ask = anchor.ask, ask.status == .open else { return nil }
        return ThreadAskOffer(id: anchor.id, options: AskOptions(ask.options))
    }

    static func newestOpenAsk(_ openAsks: [OpenAsk]?, anchorMessageID: String) -> OpenAsk? {
        openAsks?
            .filter { $0.ask.status == .open && $0.threadAnchor.id == anchorMessageID }
            .max { $0.message.createdAt < $1.message.createdAt }
    }
}

/// The offered Ask as the Thread screen spends it: the options, and the Ask
/// Message's id so a second Ask arriving in the same Thread gets a fresh row
/// rather than one a previous answer already spent. It is the Message rather
/// than the Ask because the anchor fallback knows only the Message: the
/// snapshot landing on the anchor's own Ask must not reset a row mid-press.
struct ThreadAskOffer: Equatable {
    let id: String
    let options: AskOptions
}
