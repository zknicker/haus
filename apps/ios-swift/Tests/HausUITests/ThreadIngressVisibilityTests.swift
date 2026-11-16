import HausModels
@testable import HausUI
import Testing

/// What the anchor's Thread ingress states, under the reader's Chat preference.
struct ThreadIngressVisibilityTests {
    @Test func hidesAnEmptyAgentClaimUntilTheReaderAsksForIt() {
        #expect(ingress(.claimed, hasReplies: false, showClaimsInChat: false) == nil)
        #expect(ingress(.claimed, hasReplies: false, showClaimsInChat: true) != nil)
    }

    @Test func keepsAClaimAHumanMadeWhateverThePreferenceSays() {
        for origin in [ClaimOrigin.composed, .converted] {
            #expect(ingress(origin, hasReplies: false, showClaimsInChat: false) != nil)
        }
    }

    /// A populated Thread always states its claim: once people are talking in
    /// it, which work they are talking about is part of reading the ingress.
    @Test func statesAHiddenClaimOnceItsThreadHasReplies() {
        #expect(ingress(.claimed, hasReplies: true, showClaimsInChat: false) != nil)
    }

    @Test func drawsNoIngressForAHiddenClaimWithNoReplies() {
        let hidden = ingress(.claimed, hasReplies: false, showClaimsInChat: false)

        #expect(ThreadPreviewProjection.showsIngress(replyCount: 0, claim: hidden) == false)
    }

    @Test func keepsTheIngressWhenAHiddenClaimsThreadFilledUp() {
        let stated = ingress(.claimed, hasReplies: true, showClaimsInChat: false)

        #expect(ThreadPreviewProjection.showsIngress(replyCount: 2, claim: stated))
    }

    @Test func drawsTheIngressForAComposedClaimBeforeItsFirstReply() {
        let visible = ingress(.composed, hasReplies: false, showClaimsInChat: false)

        #expect(ThreadPreviewProjection.showsIngress(replyCount: 0, claim: visible))
    }

    @Test func dropsTheReplyCountLabelWhenOnlyAClaimStatesItself() {
        #expect(ThreadPreviewProjection.replyLabel(replyCount: 0, hasClaim: true) == nil)
        #expect(ThreadPreviewProjection.replyLabel(replyCount: 0, hasClaim: false) == "Reply in thread")
    }

    private func ingress(
        _ origin: ClaimOrigin,
        hasReplies: Bool,
        showClaimsInChat: Bool
    ) -> ClaimPresentation? {
        ThreadPreviewProjection.ingressClaim(
            ClaimPresentation(number: 7, origin: origin, status: .inProgress, assignee: nil),
            hasReplies: hasReplies,
            showClaimsInChat: showClaimsInChat
        )
    }
}
