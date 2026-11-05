import Foundation
@testable import HausUI
import Testing

struct ThreadInlineRepliesTests {
    /// The App's `threadConversationEntries`: a Cloud Agent's launch Message
    /// is an inline reply, so it reads in time among the Thread's replies.
    @Test func inlineRepliesInterleaveWithTheThreadByTime() {
        let author = ChatFixtures.messages[0].author
        func message(_ id: String, _ offset: TimeInterval) -> MessagePresentation {
            MessagePresentation(id: id, author: author, content: id, createdAt: .now.addingTimeInterval(offset))
        }
        let items = ThreadTranscriptItem.items(
            anchor: ChatFixtures.messages[2],
            replies: [message("thread-1", -20), message("thread-2", 0)],
            includesInlineReplies: true,
            inlineReplies: [message("parent-1", -30), message("parent-2", -10)]
        )

        #expect(items.map(\.id) == [
            "thread-anchor-message-3",
            "thread-task-metadata",
            "thread-inline-replies",
            "thread-inline-reply-parent-1",
            "thread-1",
            "thread-inline-reply-parent-2",
            "thread-2",
        ])
        #expect(Set(items.map(\.id)).count == items.count)
        #expect(items.compactMap(\.replyID) == ["thread-1", "thread-2"])
    }

    @Test func ordinaryThreadsKeepTheirExistingTranscriptShape() {
        let items = ThreadTranscriptItem.items(
            anchor: ChatFixtures.messages[1],
            replies: []
        )

        #expect(items.map(\.id) == ["thread-anchor-message-2"])
    }
}
