import HausModels
@testable import HausUI
import Testing

/// What the anchor's Thread ingress states, under the reader's Chat preference.
struct ThreadIngressVisibilityTests {
    @Test func hidesAnEmptyClaimedTaskUntilTheReaderAsksForIt() {
        #expect(ingress(.claimed, hasReplies: false, showTasksInChat: false) == nil)
        #expect(ingress(.claimed, hasReplies: false, showTasksInChat: true) != nil)
    }

    @Test func keepsATaskAHumanMadeWhateverThePreferenceSays() {
        for origin in [TaskOrigin.composed, .converted] {
            #expect(ingress(origin, hasReplies: false, showTasksInChat: false) != nil)
        }
    }

    /// A populated Thread always states its task: once people are talking in
    /// it, which work they are talking about is part of reading the ingress.
    @Test func statesAHiddenClaimOnceItsThreadHasReplies() {
        #expect(ingress(.claimed, hasReplies: true, showTasksInChat: false) != nil)
    }

    @Test func drawsNoIngressForAHiddenClaimWithNoReplies() {
        let hidden = ingress(.claimed, hasReplies: false, showTasksInChat: false)

        #expect(ThreadPreviewProjection.showsIngress(replyCount: 0, task: hidden) == false)
    }

    @Test func keepsTheIngressWhenAHiddenClaimsThreadFilledUp() {
        let stated = ingress(.claimed, hasReplies: true, showTasksInChat: false)

        #expect(ThreadPreviewProjection.showsIngress(replyCount: 2, task: stated))
    }

    @Test func drawsTheIngressForAComposedTaskBeforeItsFirstReply() {
        let visible = ingress(.composed, hasReplies: false, showTasksInChat: false)

        #expect(ThreadPreviewProjection.showsIngress(replyCount: 0, task: visible))
    }

    @Test func dropsTheReplyCountLabelWhenOnlyATaskStatesItself() {
        #expect(ThreadPreviewProjection.replyLabel(replyCount: 0, hasTask: true) == nil)
        #expect(ThreadPreviewProjection.replyLabel(replyCount: 0, hasTask: false) == "Reply in thread")
    }

    private func ingress(
        _ origin: TaskOrigin,
        hasReplies: Bool,
        showTasksInChat: Bool
    ) -> TaskPresentation? {
        ThreadPreviewProjection.ingressTask(
            TaskPresentation(number: 7, origin: origin, status: .inProgress, assignee: nil),
            hasReplies: hasReplies,
            showTasksInChat: showTasksInChat
        )
    }
}
