import HausModels
@testable import HausUI
import Testing

/// What the anchor's Thread ingress states, under the reader's Chat preference.
struct ThreadIngressVisibilityTests {
    @Test func hidesAClaimedTaskUntilTheReaderAsksForIt() {
        #expect(ThreadPreviewProjection.ingressTask(task(.claimed), showTasksInChat: false) == nil)
        #expect(ThreadPreviewProjection.ingressTask(task(.claimed), showTasksInChat: true) != nil)
    }

    @Test func keepsATaskAHumanMadeWhateverThePreferenceSays() {
        for origin in [TaskOrigin.composed, .converted] {
            #expect(ThreadPreviewProjection.ingressTask(task(origin), showTasksInChat: false) != nil)
        }
    }

    @Test func drawsNoIngressForAHiddenClaimWithNoReplies() {
        let hidden = ThreadPreviewProjection.ingressTask(task(.claimed), showTasksInChat: false)

        #expect(ThreadPreviewProjection.showsIngress(replyCount: 0, task: hidden) == false)
    }

    @Test func keepsTheIngressWhenAHiddenClaimsThreadFilledUp() {
        let hidden = ThreadPreviewProjection.ingressTask(task(.claimed), showTasksInChat: false)

        #expect(ThreadPreviewProjection.showsIngress(replyCount: 2, task: hidden))
    }

    @Test func drawsTheIngressForAComposedTaskBeforeItsFirstReply() {
        let visible = ThreadPreviewProjection.ingressTask(task(.composed), showTasksInChat: false)

        #expect(ThreadPreviewProjection.showsIngress(replyCount: 0, task: visible))
    }

    @Test func dropsTheReplyCountLabelWhenOnlyATaskStatesItself() {
        #expect(ThreadPreviewProjection.replyLabel(replyCount: 0, hasTask: true) == nil)
        #expect(ThreadPreviewProjection.replyLabel(replyCount: 0, hasTask: false) == "Reply in thread")
    }

    private func task(_ origin: TaskOrigin) -> TaskPresentation {
        TaskPresentation(number: 7, origin: origin, status: .inProgress, assignee: nil)
    }
}
