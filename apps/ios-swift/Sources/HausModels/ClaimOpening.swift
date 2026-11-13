/// Where opening a claim lands.
///
/// A claim's work surface is always a Thread, and `claim.chatID` is always the
/// top-level Channel or DM that numbers it. A claim on a top-level message
/// works in the Thread anchored on that message. An Agent may also claim a
/// message inside a Thread; Threads never nest, so that claim works in the
/// Thread it already sits in, and opening it opens that Thread on its own
/// anchor, landing on the claim message.
public enum ClaimOpening: Equatable, Sendable {
    /// The Thread anchored on the claim message, which may not exist yet.
    case anchoredThread(parentChatID: String, threadChatID: String)
    /// The Thread the claim message sits in.
    case containingThread(parentChatID: String, threadChatID: String, landingMessageID: String)

    public init(_ item: ClaimListItem) {
        self.init(claim: item.claim, messageChatID: item.message.chatID)
    }

    public init(claim: MessageClaim, messageChatID: String) {
        if claim.sitsInThread(messageChatID: messageChatID) {
            self = .containingThread(
                parentChatID: claim.chatID,
                threadChatID: claim.threadChatID,
                landingMessageID: claim.messageID
            )
        } else {
            self = .anchoredThread(parentChatID: claim.chatID, threadChatID: claim.threadChatID)
        }
    }
}

public extension MessageClaim {
    /// Whether the claim's message sits inside a Thread rather than at the top
    /// of its Channel or DM. The wire says so without a field of its own: a
    /// Thread message's Chat is the Thread, never the claim's `chatID`.
    func sitsInThread(messageChatID: String) -> Bool {
        messageChatID != chatID
    }
}
