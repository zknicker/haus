import Foundation
import Testing
@testable import HausUI

/// What the long-press drawer offers for a message on each screen.
struct MessageActionMenuTests {
    private let author = MessageAuthorPresentation(id: "agent_blippy", name: "Blippy", avatarURL: nil)
    private let you = ReactorPresentation(id: "user_1", name: "You", isViewer: true)
    private let blippy = ReactorPresentation(id: "agent_blippy", name: "Blippy")
    private let cove = ReactorPresentation(id: "agent_cove", name: "Cove")

    private func message(_ content: String = "Ship it") -> MessagePresentation {
        MessagePresentation(id: "m1", author: author, content: content, createdAt: .now)
    }

    @Test func chatWithInlineRepliesOffersReplyThenCopy() {
        let groups = MessageActionMenu.groups(for: message(), canReplyInline: true)
        #expect(groups == [[.reply], [.copyText]])
    }

    @Test func aScreenWithoutInlineRepliesKeepsOnlyCopying() {
        #expect(MessageActionMenu.groups(for: message(), canReplyInline: false) == [[.copyText]])
    }

    @Test func anAttachmentOnlyMessageHasNothingToCopy() {
        #expect(MessageActionMenu.groups(for: message(""), canReplyInline: true) == [[.reply]])
        #expect(MessageActionMenu.groups(for: message(""), canReplyInline: false) == [])
    }

    @Test func aCaptainsMessageLeadsBackToItsTurnAndAPersonsDoesNot() {
        let captain = MessageAuthorPresentation(id: "agent_blippy", name: "Blippy", avatarURL: nil, kind: .captain)
        let reply = MessagePresentation(id: "m2", author: captain, content: "Done", createdAt: .now)

        #expect(MessageActionMenu.groups(for: reply, canReplyInline: true, canViewTurnDetails: true)
            == [[.reply], [.copyText], [.viewTurnDetails]])
        #expect(MessageActionMenu.groups(for: reply, canReplyInline: true) == [[.reply], [.copyText]])
        #expect(MessageActionMenu.groups(for: message(), canReplyInline: true, canViewTurnDetails: true)
            == [[.reply], [.copyText]])
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
