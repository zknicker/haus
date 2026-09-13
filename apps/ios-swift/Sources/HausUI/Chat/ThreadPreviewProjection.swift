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

    /// The task the ingress states, under the reader's Chat preference.
    ///
    /// An Agent's claim on a message is bookkeeping it keeps on its own work,
    /// so while nothing has come of it and the reader has not asked to see
    /// tasks in Chat it contributes nothing here: no note, no reserved row. A
    /// task a human made always states itself, whatever the preference says.
    ///
    /// A populated Thread always states its task. Once there are replies the
    /// card is on screen anyway, and a reader following a conversation about
    /// work needs to know which work — the preference hides empty claims, not
    /// the identity of a Thread somebody is already talking in.
    public static func ingressTask(
        _ task: TaskPresentation?,
        hasReplies: Bool,
        showTasksInChat: Bool
    ) -> TaskPresentation? {
        guard let task,
              hasReplies
              || TaskVisibility.visibleInChat(origin: task.origin, showTasksInChat: showTasksInChat)
        else { return nil }
        return task
    }

    /// Whether the anchor draws an ingress at all. The card exists for the
    /// Thread's replies and for the marks under the message, so a hidden claim
    /// with nothing said under it leaves the message exactly as it was.
    public static func showsIngress(replyCount: Int, task: TaskPresentation?) -> Bool {
        replyCount > 0 || task != nil
    }

    /// The count as the ingress says it. A task ingress with no replies yet
    /// keeps just the chevron; the row is still the way in, but "0 replies"
    /// is noise next to the task summary.
    public static func replyLabel(replyCount: Int, hasTask: Bool) -> String? {
        guard replyCount > 0 else {
            return hasTask ? nil : "Reply in thread"
        }
        return replyCount == 1 ? "1 reply" : "\(replyCount) replies"
    }
}
