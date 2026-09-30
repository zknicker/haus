import Foundation
import Testing
@testable import HausUI

/// The pile is one sticker per (emoji, reactor) in the Server's order, four
/// drawn and the rest behind "+N", each leaning the way the App leans it.
struct ReactionPileModelTests {
    private let tiny = ReactorPresentation(id: "agent_tiny", name: "Tiny")
    private let blippy = ReactorPresentation(id: "agent_blippy", name: "Blippy")
    private let you = ReactorPresentation(id: "user_1", name: "You", isViewer: true)

    @Test func twoPeoplesThumbsAreTwoStickers() {
        let pile = ReactionPile.build(
            reactions: [MessageReactionPresentation(emoji: "👍", reactors: [tiny, you])],
            pending: [],
            viewerUserID: "user_1"
        )

        #expect(pile.stickers.map(\.emoji) == ["👍", "👍"])
        #expect(pile.stickers.map(\.reactor.id) == ["agent_tiny", "user_1"])
        // Either 👍 sticker toggles the viewer's own 👍 off.
        #expect(pile.stickers.allSatisfy { $0.isOwn })
        #expect(pile.overflow.isEmpty)
    }

    @Test func stickersPastFourCollapseIntoOverflowInServerOrder() {
        let pile = ReactionPile.build(
            reactions: [
                MessageReactionPresentation(emoji: "👍", reactors: [tiny, blippy]),
                MessageReactionPresentation(emoji: "❤️", reactors: [tiny]),
                MessageReactionPresentation(emoji: "😂", reactors: [blippy]),
                MessageReactionPresentation(emoji: "💯", reactors: [tiny, you]),
            ],
            pending: [],
            viewerUserID: "user_1"
        )

        #expect(pile.stickers.map(\.emoji) == ["👍", "👍", "❤️", "😂"])
        #expect(pile.overflow.map(\.emoji) == ["💯", "💯"])
        #expect(pile.stickers.allSatisfy { !$0.isOwn })
        #expect(pile.overflow.allSatisfy { $0.isOwn })
    }

    @Test func pendingOwnAddJoinsTheEndUntilTheServerCopyLands() {
        let reactions = [MessageReactionPresentation(emoji: "👍", reactors: [tiny])]
        let pending = ReactionPile.build(reactions: reactions, pending: ["❤️"], viewerUserID: "user_1")

        #expect(pending.stickers.map(\.id) == [
            ReactionPile.key(emoji: "👍", reactorID: "agent_tiny"),
            ReactionPile.key(emoji: "❤️", reactorID: "user_1"),
        ])
        #expect(pending.stickers.last?.isOwn == true)

        // The Server's copy carries the same key, so the pile does not double it.
        let confirmed = ReactionPile.build(
            reactions: reactions + [MessageReactionPresentation(emoji: "❤️", reactors: [you])],
            pending: ["❤️"],
            viewerUserID: "user_1"
        )
        #expect(confirmed.stickers.map(\.id) == pending.stickers.map(\.id))
    }

    @Test func poseIsStableAndMatchesTheApp() {
        let mine = ReactionSticker(emoji: "👍", reactor: you, isOwn: true)
        let theirs = ReactionSticker(emoji: "👍", reactor: tiny, isOwn: false)

        // Values computed by the App's `stableHash` and `stickerPose`.
        #expect(StickerPose.stableHash("message_1:👍:user_1") == 389_736_605)
        let minePose = StickerPose(messageID: "message_1", sticker: mine)
        let theirPose = StickerPose(messageID: "message_1", sticker: theirs)
        #expect(minePose.jitter == 3 && minePose.tilt == -7)
        #expect(theirPose.jitter == -2 && theirPose.tilt == 6)
    }

    @Test func everyPoseStaysInsideTheHandStuckRange() {
        for index in 0..<200 {
            let sticker = ReactionSticker(
                emoji: "😂",
                reactor: ReactorPresentation(id: "user_\(index)", name: "U"),
                isOwn: false
            )
            let pose = StickerPose(messageID: "message_\(index)", sticker: sticker)
            #expect((5...14).contains(abs(pose.tilt)))
            #expect((-3...3).contains(pose.jitter))
        }
    }

    @Test func burstMatchesTheAppForTheSameSeed() {
        let particles = BurstParticle.particles(seed: 389_736_605)

        #expect(particles.count == 32)
        #expect(particles[0].kind == .puff)
        #expect(particles[0].dx == 53 && particles[0].dy == 1 && particles[0].size == 13)
        #expect(particles[20].kind == .speck)
        #expect(particles[20].dx == -6 && particles[20].dy == -42 && particles[20].size == 5)
    }
}
