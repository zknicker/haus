import Foundation

/// Where an open Ask's answer is sent.
///
/// There is no answer procedure. An answer is an ordinary `chat.send` carrying
/// the chosen option, addressed to the conversation the Ask belongs to and to
/// the Message its answer Thread hangs off. Pressing an offered option and
/// typing the same words are therefore the same send, and Server settles the
/// Ask as a side effect of either.
///
/// That is why the phone opens an Ask as its answer Thread: the Thread
/// composer already sends this exact pair, so the offered options ride the
/// send the screen has, rather than a second one that could drift from it.
public struct AskAnswerRoute: Equatable, Sendable {
    /// The Channel or DM the conversation belongs to — never the Thread's own
    /// Chat id, which is what a Thread reply would look like if it were routed
    /// by the Chat it lands in rather than by the Message it answers.
    public let chatID: String
    /// The Message the answer Thread hangs off: the Thread's own anchor when
    /// the Ask was posted inside one, and the Ask's own Message when it was
    /// not. The Swift port of the shared `openAskThreadAnchor` rule.
    public let anchorMessageID: String

    public init(_ ask: OpenAsk) {
        chatID = ask.conversationChatID
        anchorMessageID = ask.threadAnchor.id
    }
}
