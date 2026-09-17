import SwiftUI

enum ThreadTranscriptItem: Identifiable, Equatable {
    case anchor(MessagePresentation, hasReplies: Bool)
    case taskMetadata(TaskPresentation, hasReplies: Bool)
    case inlineReplies
    case threadHeader
    case reply(MessagePresentation)
    case pendingSend

    var id: String {
        switch self {
        case .anchor(let message, _): "thread-anchor-\(message.id)"
        case .taskMetadata: "thread-task-metadata"
        case .inlineReplies: "thread-inline-replies"
        case .threadHeader: "thread-header"
        case .reply(let message): message.id
        case .pendingSend: "thread-pending-send"
        }
    }

    var isPending: Bool {
        switch self {
        case .pendingSend: true
        case .reply(let message): message.isPending
        case .anchor, .taskMetadata, .inlineReplies, .threadHeader: false
        }
    }

    var replyID: String? {
        if case .reply(let message) = self { return message.id }
        return nil
    }

    /// The Thread transcript in order: the anchor, its task metadata when it
    /// has any, the replies, and the viewer's own send while it is in flight.
    static func items(
        anchor: MessagePresentation,
        replies: [MessagePresentation],
        pending: Bool,
        includesInlineReplies: Bool = false
    ) -> [ThreadTranscriptItem] {
        let hasReplies = !replies.isEmpty
        var items: [ThreadTranscriptItem] = [.anchor(anchor, hasReplies: hasReplies)]
        if let task = anchor.task {
            items.append(.taskMetadata(task, hasReplies: hasReplies))
        }
        if includesInlineReplies {
            items.append(.inlineReplies)
            items.append(.threadHeader)
        }
        items.append(contentsOf: replies.map(ThreadTranscriptItem.reply))
        if pending {
            items.append(.pendingSend)
        }
        return items
    }
}

/// The viewer's own reply while the send is in flight, aligned under the reply
/// column rather than the avatar rail.
struct ThreadPendingSendRow: View {
    var body: some View {
        HStack(spacing: 7) {
            ProgressView()
                .controlSize(.small)
            Text("Sending")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.leading, 46)
        .padding(.top, 12)
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
