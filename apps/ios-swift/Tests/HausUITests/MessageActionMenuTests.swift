import Foundation
import Testing
@testable import HausUI

/// What the long-press drawer offers for a message on each screen.
struct MessageActionMenuTests {
    private let author = MessageAuthorPresentation(id: "agent_blippy", name: "Blippy", avatarURL: nil)
    private let you = ReactorPresentation(id: "user_1", name: "You", isViewer: true)
    private let blippy = ReactorPresentation(id: "agent_blippy", name: "Blippy")
    private let cove = ReactorPresentation(id: "agent_cove", name: "Cove")

    private func message(_ content: String = "Ship it", thread: ThreadPreviewPresentation? = nil) -> MessagePresentation {
        MessagePresentation(id: "m1", author: author, content: content, createdAt: .now, thread: thread)
    }

    @Test func chatWithInlineRepliesOffersReplyThreadThenCopy() {
        let groups = MessageActionMenu.groups(for: message(), canReplyInline: true, canOpenThread: true)
        #expect(groups == [[.reply, .replyInThread], [.copyText]])
    }

    @Test func aMessageWithAThreadOpensIt() {
        let thread = ThreadPreviewPresentation(threadChatID: "t1", replyCount: 2, unreadCount: 0, recentReplies: [])
        let groups = MessageActionMenu.groups(for: message(thread: thread), canReplyInline: false, canOpenThread: true)
        #expect(groups == [[.openThread], [.copyText]])
    }

    @Test func theThreadKeepsOnlyCopying() {
        #expect(MessageActionMenu.groups(for: message(), canReplyInline: false, canOpenThread: false) == [[.copyText]])
    }

    @Test func anAttachmentOnlyMessageHasNothingToCopy() {
        let groups = MessageActionMenu.groups(for: message(""), canReplyInline: false, canOpenThread: true)
        #expect(groups == [[.replyInThread]])
    }

    @Test func quickTilesAreTheHeadOfFrequentlyUsed() {
        let tiles = MessageActionMenu.quickTiles(frequent: ["🦖"] + FrequentEmoji.seed)
        #expect(tiles == ["🦖", "👍", "❤️", "😂", "💯", "🔥"])
    }

    @Test func reactorsListTheViewersOwnFirstAndSummarizeByName() {
        let entries = [
            ReactionSticker(emoji: "👍", reactor: blippy, isOwn: true),
            ReactionSticker(emoji: "👍", reactor: you, isOwn: true),
            ReactionSticker(emoji: "🔥", reactor: cove, isOwn: false),
            ReactionSticker(emoji: "🔥", reactor: blippy, isOwn: false),
            ReactionSticker(emoji: "🦖", reactor: you, isOwn: true),
        ]
        let rows = MessageActionMenu.reactorRows(entries)
        #expect(rows.map(\.reactor.name) == ["You", "You", "Blippy", "Cove", "Blippy"])
        #expect(rows.map(\.emoji) == ["👍", "🦖", "👍", "🔥", "🔥"])
        let summary = MessageActionMenu.reactorSummary(entries)
        #expect(summary?.count == "5 reactions")
        #expect(summary?.names == "You, Blippy, Cove")
        #expect(MessageActionMenu.reactorSummary([]) == nil)
    }
}
