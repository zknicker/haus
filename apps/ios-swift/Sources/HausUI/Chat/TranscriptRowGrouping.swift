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
///
/// The assistant layout has no identity block. A row there continues the one
/// above when the same speaker goes on without a break, and a centered time
/// leads each new turn instead of a day divider.
struct TranscriptRowGrouping: Equatable {
    let isContinuation: Bool
    let showsReplyReference: Bool
    /// The first row of a calendar day.
    let startsDay: Bool
    /// What leads the row: a day divider in the roster, a time in the assistant.
    let divider: TranscriptRowDivider?

    static let continuationWindow: TimeInterval = 5 * 60
    /// The pause after which a turn the person opens states its time.
    static let turnWindow: TimeInterval = 5 * 60
    /// The pause after which any assistant row states its time.
    static let quietWindow: TimeInterval = 60 * 60

    init(
        _ message: MessagePresentation,
        after previous: MessagePresentation?,
        style: TranscriptStyle = .roster,
        calendar: Calendar = .current
    ) {
        let parentID = message.inlineReply?.id
        let previousParentID = previous?.inlineReply?.id
        let repeatsReference = previous.map {
            parentID != nil && parentID == previousParentID && $0.author.id == message.author.id
        } ?? false
        let showsReplyReference = parentID != nil && !repeatsReference
        let startsDay = previous.map {
            !calendar.isDate($0.createdAt, inSameDayAs: message.createdAt)
        } ?? true
        self.showsReplyReference = showsReplyReference
        self.startsDay = startsDay

        switch style {
        case .roster:
            divider = startsDay ? .day : nil
            isContinuation = Self.rosterContinues(
                message,
                after: previous,
                startsDay: startsDay,
                repeatsReference: repeatsReference
            )
        case .assistant:
            let showsTime = Self.assistantShowsTime(message, after: previous, startsDay: startsDay)
            divider = showsTime ? .time : nil
            isContinuation = previous.map {
                !showsTime
                    && !showsReplyReference
                    && message.cause == nil
                    && TranscriptSpeaker($0) == TranscriptSpeaker(message)
            } ?? false
        }
    }

    /// A cause line sits above its message's identity, so that message always
    /// opens its own block.
    private static func rosterContinues(
        _ message: MessagePresentation,
        after previous: MessagePresentation?,
        startsDay: Bool,
        repeatsReference: Bool
    ) -> Bool {
        guard let previous,
              !startsDay,
              message.cause == nil,
              previous.author.id == message.author.id,
              message.createdAt.timeIntervalSince(previous.createdAt) < continuationWindow
        else { return false }
        let neitherReplies = message.inlineReply == nil && previous.inlineReply == nil
        return neitherReplies || repeatsReference
    }

    /// A turn opens when the person speaks after a Captain. It states its
    /// time after a pause, and any row does after a long quiet or a new day.
    private static func assistantShowsTime(
        _ message: MessagePresentation,
        after previous: MessagePresentation?,
        startsDay: Bool
    ) -> Bool {
        guard let previous else { return true }
        if startsDay { return true }
        let gap = message.createdAt.timeIntervalSince(previous.createdAt)
        if gap >= quietWindow { return true }
        let opensTurn = TranscriptSpeaker(message) == .person && TranscriptSpeaker(previous) != .person
        return opensTurn && gap >= turnWindow
    }
}

/// The rule that leads a transcript row.
enum TranscriptRowDivider: Equatable, Sendable {
    /// The roster's day divider.
    case day
    /// The assistant's centered turn time.
    case time
}
