import Foundation

/// How a Chat row joins the row above it: whether it opens a new day, whether
/// it continues that row's identity block, and whether it states its
/// inline-reply reference.
///
/// The repeat rule mirrors the App's `markRepeatedReplyReferences`: a reply
/// that continues its author's previous message — same author, same parent —
/// skips the reference, so an acknowledgment and its follow-up read as one
/// answer under one reference. A reference that shows always opens a new
/// identity block, because it sits above that block's avatar and name and
/// would otherwise read as belonging to the message above. A plain message
/// never joins a reply's block for the same reason, and no block runs across a
/// day divider.
struct TranscriptRowGrouping: Equatable {
    let isContinuation: Bool
    let showsReplyReference: Bool
    /// The first row of a calendar day, which leads with a day divider.
    let startsDay: Bool

    static let continuationWindow: TimeInterval = 5 * 60

    init(
        _ message: MessagePresentation,
        after previous: MessagePresentation?,
        calendar: Calendar = .current
    ) {
        let parentID = message.inlineReply?.id
        let previousParentID = previous?.inlineReply?.id
        let repeatsReference = previous.map {
            parentID != nil && parentID == previousParentID && $0.author.id == message.author.id
        } ?? false
        showsReplyReference = parentID != nil && !repeatsReference
        startsDay = previous.map {
            !calendar.isDate($0.createdAt, inSameDayAs: message.createdAt)
        } ?? true

        // A cause line sits above its message's identity, so that message
        // always opens its own block.
        guard let previous,
              !startsDay,
              message.cause == nil,
              previous.author.id == message.author.id,
              message.createdAt.timeIntervalSince(previous.createdAt) < Self.continuationWindow
        else {
            isContinuation = false
            return
        }
        let neitherReplies = parentID == nil && previousParentID == nil
        isContinuation = neitherReplies || repeatsReference
    }
}
