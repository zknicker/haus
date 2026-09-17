@testable import HausUI
import Testing

struct ThreadInlineRepliesTests {
    @Test func taskInspectionSeparatesTheParentChainFromTheDedicatedThread() {
        let items = ThreadTranscriptItem.items(
            anchor: ChatFixtures.messages[2],
            replies: [.init(
                id: "dedicated-reply",
                author: ChatFixtures.messages[0].author,
                content: "A thread reply",
                createdAt: .now
            )],
            pending: false,
            includesInlineReplies: true
        )

        #expect(items.map(\.id) == [
            "thread-anchor-message-3",
            "thread-task-metadata",
            "thread-inline-replies",
            "thread-header",
            "dedicated-reply",
        ])
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
