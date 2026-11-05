import SwiftUI

enum ThreadTranscriptItem: Identifiable, Equatable {
    case anchor(MessagePresentation, hasReplies: Bool)
    case taskMetadata(TaskPresentation, hasReplies: Bool)
    /// Owns the parent chain's load; draws only its failure.
    case inlineReplies
    case inlineReply(MessagePresentation)
    case reply(MessagePresentation)
    /// Opens a calendar day.
    case dayDivider(Date)

    var id: String {
        switch self {
        case .anchor(let message, _): "thread-anchor-\(message.id)"
        case .taskMetadata: "thread-task-metadata"
        case .inlineReplies: "thread-inline-replies"
        case .inlineReply(let message): "thread-inline-reply-\(message.id)"
        case .reply(let message): message.id
        case .dayDivider(let date): "thread-day-\(Int(date.timeIntervalSinceReferenceDate))"
        }
    }

    var isPending: Bool {
        switch self {
        case .reply(let message): message.isPending
        case .inlineReply(let message): message.isPending
        case .anchor, .taskMetadata, .inlineReplies, .dayDivider: false
        }
    }

    var replyID: String? {
        if case .reply(let message) = self { return message.id }
        return nil
    }

    /// The message this row draws, if it draws one.
    var message: MessagePresentation? {
        switch self {
        case .anchor(let message, _), .inlineReply(let message), .reply(let message): message
        case .taskMetadata, .inlineReplies, .dayDivider: nil
        }
    }

    /// The Thread transcript in order: the anchor, its task metadata when it
    /// has any, then one conversation by time — the parent Chat's inline
    /// replies to the anchor among the Thread's replies, the viewer's own
    /// optimistic replies with them. Chat sequences are local to each source,
    /// so creation time orders them, as in the App's
    /// `threadConversationEntries`. A day divider opens each calendar day
    /// after the anchor's.
    static func items(
        anchor: MessagePresentation,
        replies: [MessagePresentation],
        includesInlineReplies: Bool = false,
        inlineReplies: [MessagePresentation] = [],
        calendar: Calendar = .current
    ) -> [ThreadTranscriptItem] {
        let hasReplies = !replies.isEmpty
        var items: [ThreadTranscriptItem] = [.anchor(anchor, hasReplies: hasReplies)]
        if let task = anchor.task {
            items.append(.taskMetadata(task, hasReplies: hasReplies))
        }
        if includesInlineReplies {
            items.append(.inlineReplies)
        }
        let conversation = inlineReplies.map { (message: $0, row: ThreadTranscriptItem.inlineReply($0)) }
            + replies.map { (message: $0, row: ThreadTranscriptItem.reply($0)) }
        let ordered = conversation.enumerated().sorted {
            ($0.element.message.createdAt, $0.offset) < ($1.element.message.createdAt, $1.offset)
        }
        var previous = anchor.createdAt
        for (_, entry) in ordered {
            if !calendar.isDate(previous, inSameDayAs: entry.message.createdAt) {
                items.append(.dayDivider(calendar.startOfDay(for: entry.message.createdAt)))
            }
            items.append(entry.row)
            previous = entry.message.createdAt
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

#Preview("Task Thread") {
    NavigationStack {
        ThreadDetailView(
            anchor: ChatFixtures.messages[2],
            replies: [
                MessagePresentation(
                    id: "task-thread-reply-1",
                    author: ChatFixtures.messages[1].author,
                    content: "I’ll keep the work visible in this Thread.",
                    createdAt: .now.addingTimeInterval(-45)
                ),
            ],
            onSend: { _, _ in true }
        )
    }
}
