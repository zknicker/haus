import Foundation
import HausModels
@testable import HausUI
import Testing

/// Unread Threads as their own Unread rows (ADR 0043).
struct InboxUnreadThreadRowsTests {
    @Test func mergesThreadRowsWithChatsByActivity() {
        let rows = InboxUnreadRows.rows(
            [
                InboxFixtures.chat(id: "chat_new", name: "all", lastActivityAt: Date(timeIntervalSince1970: 1_800_000_300)),
                InboxFixtures.chat(id: "chat_old", name: "product", lastActivityAt: Date(timeIntervalSince1970: 1_800_000_100)),
            ],
            threads: [
                thread(id: "thread_1", channelName: "design", at: Date(timeIntervalSince1970: 1_800_000_200)),
            ],
            viewerDisplayName: "Marlow"
        )

        #expect(rows.map(\.id) == ["chat_new", "thread_1", "chat_old"])
        #expect(rows.map(\.open) == [.chat("chat_new"), .thread(threadChatID: "thread_1"), .chat("chat_old")])
    }

    /// A DM Thread names its place "DM", never the peer.
    @Test func namesTheParentChannelOrDM() {
        let rows = InboxUnreadRows.rows(
            [],
            threads: [
                thread(id: "in_channel", channelName: "design"),
                thread(id: "in_dm", channelName: nil, at: Date(timeIntervalSince1970: 1_700_000_000)),
            ],
            viewerDisplayName: nil
        )

        #expect(rows.map(\.title) == ["#design", "DM"])
    }

    @Test func quotesTheNewestReplyAsAThreadReply() {
        let reply = InboxFixtures.lastMessage(author: "Blippy", content: "Shipped **it**")

        #expect(InboxUnreadThreadPreview.line(reply, viewerDisplayName: "Marlow") == "Blippy replied in thread: Shipped it")
        #expect(InboxUnreadThreadPreview.line(reply, viewerDisplayName: "Blippy") == "You replied in thread: Shipped it")
        #expect(InboxUnreadThreadPreview.line(nil, viewerDisplayName: nil) == "New replies in thread")
    }

    private func thread(
        id: String,
        channelName: String?,
        at: Date = Date(timeIntervalSince1970: 1_800_000_000)
    ) -> InboxUnreadThread {
        InboxUnreadThread(
            id: id,
            channelName: channelName,
            mark: .channel(ChannelAppearance(icon: nil, color: nil)),
            lastActivityAt: at,
            latestReply: nil
        )
    }
}
