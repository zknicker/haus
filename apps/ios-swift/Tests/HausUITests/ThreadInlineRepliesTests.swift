@testable import HausUI
import Testing

struct ThreadInlineRepliesTests {
    @Test func taskInspectionSeparatesTheParentChainFromTheDedicatedThread() {
        let inlineReplies = [
            MessagePresentation(
                id: "parent-inline-1",
                author: ChatFixtures.messages[0].author,
                content: "An inline parent reply",
                createdAt: .now.addingTimeInterval(-30)
            ),
            MessagePresentation(
                id: "parent-inline-2",
                author: ChatFixtures.messages[1].author,
                content: "Another inline parent reply",
                createdAt: .now.addingTimeInterval(-15)
            ),
        ]
        let items = ThreadTranscriptItem.items(
            anchor: ChatFixtures.messages[2],
            replies: [.init(
                id: "dedicated-reply",
                author: ChatFixtures.messages[0].author,
                content: "A thread reply",
                createdAt: .now
            )],
            pending: false,
            includesInlineReplies: true,
            inlineReplies: inlineReplies
        )

        #expect(items.map(\.id) == [
            "thread-anchor-message-3",
            "thread-task-metadata",
            "thread-inline-replies",
            "thread-inline-reply-parent-inline-1",
            "thread-inline-reply-parent-inline-2",
            "thread-header",
            "dedicated-reply",
        ])
        #expect(Set(items.map(\.id)).count == items.count)
        #expect(items.compactMap(\.replyID) == ["dedicated-reply"])
        #expect(items[3].replyID == nil)
    }

    @Test func ordinaryThreadsKeepTheirExistingTranscriptShape() {
        let items = ThreadTranscriptItem.items(
            anchor: ChatFixtures.messages[1],
            replies: [],
            pending: false
        )

        #expect(items.map(\.id) == ["thread-anchor-message-2"])
    }
}
