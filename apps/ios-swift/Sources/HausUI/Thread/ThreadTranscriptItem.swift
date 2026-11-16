import SwiftUI

/// One row of the Thread transcript. Every message row carries the same
/// `TranscriptRowGrouping` a Chat row does, so a Thread groups, states inline
/// reply references, and opens days exactly like the Chat timeline.
enum ThreadTranscriptItem: Identifiable, Equatable {
    /// What the anchor's claim is and where it stands, above the anchor, as
    /// the web Thread puts its metadata above the conversation.
    case claimMetadata(ClaimPresentation)
    case anchor(MessagePresentation, grouping: TranscriptRowGrouping)
    /// Owns the parent chain's load; draws only its failure.
    case inlineReplies
    case inlineReply(MessagePresentation, grouping: TranscriptRowGrouping)
    case reply(MessagePresentation, grouping: TranscriptRowGrouping)
    /// Opens a calendar day.
    case dayDivider(Date)

    var id: String {
        switch self {
        case .claimMetadata: "thread-claim-metadata"
        case .anchor(let message, _): "thread-anchor-\(message.id)"
        case .inlineReplies: "thread-inline-replies"
        case .inlineReply(let message, _): "thread-inline-reply-\(message.id)"
        case .reply(let message, _): message.id
        case .dayDivider(let date): "thread-day-\(Int(date.timeIntervalSinceReferenceDate))"
        }
    }

    var isPending: Bool {
        switch self {
        case .reply(let message, _), .inlineReply(let message, _): message.isPending
        case .anchor, .claimMetadata, .inlineReplies, .dayDivider: false
        }
    }

    var replyID: String? {
        if case .reply(let message, _) = self { return message.id }
        return nil
    }

    /// The message this row draws, if it draws one.
    var message: MessagePresentation? {
        switch self {
        case .anchor(let message, _), .inlineReply(let message, _), .reply(let message, _): message
        case .claimMetadata, .inlineReplies, .dayDivider: nil
        }
    }

    /// The Thread transcript in order: the anchor's claim metadata when it has
    /// any, the anchor, then one conversation by time — the parent Chat's
    /// inline replies to the anchor among the Thread's replies, the viewer's
    /// own optimistic replies with them. Chat sequences are local to each
    /// source, so creation time orders them, as in the App's
    /// `threadConversationEntries`. Each message groups with the one above it,
    /// the anchor included, and a day divider opens each calendar day after
    /// the anchor's.
    static func items(
        anchor: MessagePresentation,
        replies: [MessagePresentation],
        includesInlineReplies: Bool = false,
        inlineReplies: [MessagePresentation] = [],
        calendar: Calendar = .current
    ) -> [ThreadTranscriptItem] {
        var items: [ThreadTranscriptItem] = []
        if let claim = anchor.claim {
            items.append(.claimMetadata(claim))
        }
        items.append(.anchor(anchor, grouping: TranscriptRowGrouping(anchor, after: nil, calendar: calendar)))
        if includesInlineReplies {
            items.append(.inlineReplies)
        }
        let conversation = inlineReplies.map { (message: $0, isInline: true) }
            + replies.map { (message: $0, isInline: false) }
        let ordered = conversation.enumerated().sorted {
            ($0.element.message.createdAt, $0.offset) < ($1.element.message.createdAt, $1.offset)
        }
        var previous = anchor
        for (_, entry) in ordered {
            // The anchor heads the transcript, so a reply to it states no
            // reference; a reference to any other message still shows.
            let grouping = TranscriptRowGrouping(
                entry.message,
                after: previous,
                implicitReplyID: anchor.id,
                calendar: calendar
            )
            if grouping.startsDay {
                items.append(.dayDivider(calendar.startOfDay(for: entry.message.createdAt)))
            }
            items.append(entry.isInline
                ? .inlineReply(entry.message, grouping: grouping)
                : .reply(entry.message, grouping: grouping))
            previous = entry.message
        }
        return items
    }
}

/// Decides how the thread transcript responds when its latest reply changes.
///
/// Local to the Thread surface on purpose: the chat timeline owns its own
/// parallel rule, and the two surfaces may diverge.
enum ThreadReplyReveal: Equatable {
    /// The first page just arrived; place it at the bottom with no animation
    /// so the thread appears already settled.
    case settle
    /// Reveal the latest reply with a short animated scroll.
    case animate
    /// Leave the reader where they are.
    case stay

    static func onLatestReplyChange(
        previousLatestID: String?,
        isNearBottom: Bool,
        latestIsPending: Bool
    ) -> ThreadReplyReveal {
        if previousLatestID == nil {
            return .settle
        }
        // Pending rows exist only for the viewer's outgoing sends, so a send
        // always reveals itself; other appends respect the reader's position.
        if latestIsPending || isNearBottom {
            return .animate
        }
        return .stay
    }
}

#Preview("Thread") {
    NavigationStack {
        ThreadDetailView(
            anchor: ChatFixtures.messages[1],
            replies: [
                MessagePresentation(
                    id: "thread-reply-1",
                    author: ChatFixtures.messages[0].author,
                    content: "I’ll keep the first pass focused on the native shell.",
                    createdAt: .now.addingTimeInterval(-90)
                ),
                MessagePresentation(
                    id: "thread-reply-2",
                    author: ChatFixtures.messages[1].author,
                    content: "Perfect. I’ll preserve the shared Server contract.",
                    createdAt: .now.addingTimeInterval(-45)
                ),
            ],
            onSend: { _, _ in true }
        )
    }
}

#Preview("Claim Thread") {
    NavigationStack {
        ThreadDetailView(
            anchor: ChatFixtures.messages[2],
            replies: [
                MessagePresentation(
                    id: "claim-thread-reply-1",
                    author: ChatFixtures.messages[1].author,
                    content: "I’ll keep the work visible in this Thread.",
                    createdAt: .now.addingTimeInterval(-45)
                ),
            ],
            onSend: { _, _ in true }
        )
    }
}
