import Foundation

/// The Thread transcript's items, rebuilt only when an input changes.
///
/// The screen's body runs on every keyboard inset step with the same arrays —
/// the Store memoizes them — so the comparisons are storage-identity checks
/// and the list sees the same item array, which is what lets it skip
/// re-hosting rows. A cache, not state: filling it never invalidates the view.
@MainActor
final class ThreadTranscriptProjection {
    private struct Inputs: Equatable {
        let anchor: MessagePresentation
        let replies: [MessagePresentation]
        let pending: Bool
        let includesInlineReplies: Bool
        let inlineReplies: [MessagePresentation]
    }

    private var inputs: Inputs?
    private(set) var items: [ThreadTranscriptItem] = []
    private(set) var messageIDs: [String] = []
    private(set) var imagePages: [MessageAttachmentPresentation] = []

    func update(
        anchor: MessagePresentation,
        replies: [MessagePresentation],
        pending: Bool,
        includesInlineReplies: Bool,
        inlineReplies: [MessagePresentation]
    ) {
        let next = Inputs(
            anchor: anchor,
            replies: replies,
            pending: pending,
            includesInlineReplies: includesInlineReplies,
            inlineReplies: inlineReplies
        )
        guard next != inputs else { return }
        inputs = next
        items = ThreadTranscriptItem.items(
            anchor: anchor,
            replies: replies,
            pending: pending,
            includesInlineReplies: includesInlineReplies,
            inlineReplies: inlineReplies
        )
        let messages = [anchor] + inlineReplies + replies
        messageIDs = messages.map(\.id)
        imagePages = AttachmentImagePages.pages(in: messages)
    }
}
