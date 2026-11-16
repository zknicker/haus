@testable import HausUI
import Testing

struct ThreadReplyRevealTests {
    @Test func anchorAndClaimAreNotPreviousReplies() {
        let anchor = ChatFixtures.messages[2]
        var previous: [ThreadTranscriptItem] = [.anchor(anchor, hasReplies: false)]
        if let claim = anchor.claim { previous.append(.claimMetadata(claim, hasReplies: false)) }
        #expect(ThreadReplyReveal.onLatestReplyChange(
            previousLatestID: previous.last(where: { $0.replyID != nil })?.replyID,
            isNearBottom: true,
            latestIsPending: false
        ) == .settle)
        previous.append(.reply(ChatFixtures.messages[0]))
        #expect(previous.last(where: { $0.replyID != nil })?.replyID == ChatFixtures.messages[0].id)
    }

    @Test func firstPageSettlesWithoutAnimation() {
        #expect(
            ThreadReplyReveal.onLatestReplyChange(
                previousLatestID: nil,
                isNearBottom: true,
                latestIsPending: false
            ) == .settle
        )
        // Even a first page whose newest row is the viewer's pending send
        // appears settled rather than animating into place.
        #expect(
            ThreadReplyReveal.onLatestReplyChange(
                previousLatestID: nil,
                isNearBottom: false,
                latestIsPending: true
            ) == .settle
        )
    }

    @Test func appendNearTheBottomAnimatesToTheLatestReply() {
        #expect(
            ThreadReplyReveal.onLatestReplyChange(
                previousLatestID: "reply-1",
                isNearBottom: true,
                latestIsPending: false
            ) == .animate
        )
    }

    @Test func ownPendingSendRevealsItselfFromAnywhere() {
        #expect(
            ThreadReplyReveal.onLatestReplyChange(
                previousLatestID: "reply-1",
                isNearBottom: false,
                latestIsPending: true
            ) == .animate
        )
    }

    @Test func otherAppendsLeaveAScrolledUpReaderAlone() {
        #expect(
            ThreadReplyReveal.onLatestReplyChange(
                previousLatestID: "reply-1",
                isNearBottom: false,
                latestIsPending: false
            ) == .stay
        )
    }
}
