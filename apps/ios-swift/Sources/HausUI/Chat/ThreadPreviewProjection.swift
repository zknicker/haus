import HausModels

/// The one place a Server Thread summary becomes the anchor's preview.
///
/// The App layer owns actor resolution — names, faces, and presence live in
/// its directories — so it supplies that and this keeps the Server's own
/// order and cap for the recent replies. A reply whose author cannot be
/// resolved is dropped rather than drawn as an unknown face.
public enum ThreadPreviewProjection {
    public static func presentation(
        for summary: ThreadSummary,
        resolveAuthor: (ThreadReplyPreview) -> MessageAuthorPresentation?
    ) -> ThreadPreviewPresentation {
        ThreadPreviewPresentation(
            threadChatID: summary.threadChatID,
            replyCount: summary.replyCount,
            unreadCount: summary.unreadCount,
            recentReplies: summary.recentReplies.compactMap { reply in
                guard let author = resolveAuthor(reply) else { return nil }
                return ThreadReplyPresentation(
                    id: reply.id,
                    author: author,
                    content: reply.content,
                    createdAt: reply.createdAt
                )
            }
        )
    }

    /// The preview a claim's message carries before its Thread has a summary.
    ///
    /// A top-level claim works in the Thread that would hang off its message,
    /// so the message offers that way in before the first reply. A claim on a
    /// Thread message already sits in its work surface, and Threads never
    /// nest, so it states no Thread of its own.
    public static func claimThread(
        _ claim: MessageClaim,
        messageChatID: String
    ) -> ThreadPreviewPresentation? {
        guard !claim.sitsInThread(messageChatID: messageChatID) else { return nil }
        return ThreadPreviewPresentation(
            threadChatID: claim.threadChatID,
            replyCount: 0,
            unreadCount: 0,
            recentReplies: []
        )
    }

    /// The claim the ingress states, under the reader's Chat preference.
    ///
    /// An Agent's claim on a message is bookkeeping it keeps on its own work,
    /// so while nothing has come of it and the reader has not asked to see
    /// claims in Chat it contributes nothing here: no note, no reserved row. A
    /// claim a human made always states itself, whatever the preference says.
    ///
    /// A populated Thread always states its claim. Once there are replies the
    /// card is on screen anyway, and a reader following a conversation about
    /// work needs to know which work — the preference hides empty claims, not
    /// the identity of a Thread somebody is already talking in.
    public static func ingressClaim(
        _ claim: ClaimPresentation?,
        hasReplies: Bool,
        showClaimsInChat: Bool
    ) -> ClaimPresentation? {
        guard let claim,
              hasReplies
              || ClaimVisibility.visibleInChat(origin: claim.origin, showClaimsInChat: showClaimsInChat)
        else { return nil }
        return claim
    }

    /// Whether the anchor draws an ingress at all. The card exists for the
    /// Thread's replies and for the marks under the message, so a hidden claim
    /// with nothing said under it leaves the message exactly as it was.
    public static func showsIngress(replyCount: Int, claim: ClaimPresentation?) -> Bool {
        replyCount > 0 || claim != nil
    }

    /// The count as the ingress says it. A claim ingress with no replies yet
    /// keeps just the chevron; the row is still the way in, but "0 replies"
    /// is noise next to the claim summary.
    public static func replyLabel(replyCount: Int, hasClaim: Bool) -> String? {
        guard replyCount > 0 else {
            return hasClaim ? nil : "Reply in thread"
        }
        return replyCount == 1 ? "1 reply" : "\(replyCount) replies"
    }
}
