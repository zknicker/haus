import Testing
@testable import HausAppModel

@MainActor
@Suite("Composer target beside a Task")
struct ComposerTargetTests {
    private let channel = ComposerDraftKey(serverID: "srv_a", destination: .chat("chat_product"))

    @Test("With a Task beside it, the conversation's composer writes to the Task")
    func targetsTheTask() {
        let drafts = ComposerDraftStore(makeStaged: StagedFiles.init, discardStaged: { _ in })
        #expect(drafts.target(channel, beside: "task_1") == .task("task_1"))
        #expect(drafts.target(channel, beside: nil) == .chat("chat_product"))
    }

    @Test("Each target keeps its own draft")
    func draftsPerTarget() {
        let drafts = ComposerDraftStore(makeStaged: StagedFiles.init, discardStaged: { _ in })
        let task = ComposerDraftKey(serverID: "srv_a", destination: drafts.target(channel, beside: "task_1"))
        drafts.setText("Use the Growth tier", for: task)
        drafts.setText("Looks good", for: channel)

        drafts.release(channel, from: "task_1")
        let back = ComposerDraftKey(serverID: "srv_a", destination: drafts.target(channel, beside: "task_1"))
        #expect(drafts.text(for: back) == "Looks good")
        #expect(drafts.text(for: task) == "Use the Growth tier")
    }

    @Test("The chip's × points the composer back until the card opens the Task again")
    func releaseAndAim() {
        let drafts = ComposerDraftStore(makeStaged: StagedFiles.init, discardStaged: { _ in })
        drafts.release(channel, from: "task_1")
        #expect(drafts.target(channel, beside: "task_1") == .chat("chat_product"))
        #expect(drafts.target(channel, beside: "task_2") == .task("task_2"))

        drafts.aim(at: "task_1", serverID: "srv_a")
        #expect(drafts.target(channel, beside: "task_1") == .task("task_1"))
    }

    @Test("Membership loss and sign-out forget let-go chips")
    func clears() {
        let drafts = ComposerDraftStore(makeStaged: StagedFiles.init, discardStaged: { _ in })
        let other = ComposerDraftKey(serverID: "srv_b", destination: .chat("chat_x"))
        drafts.release(channel, from: "task_1")
        drafts.release(other, from: "task_2")

        drafts.clear(serverID: "srv_a")
        #expect(drafts.releasedTargets == [ComposerTaskTarget(conversation: other, taskID: "task_2")])
        drafts.clearAll()
        #expect(drafts.releasedTargets.isEmpty)
    }
}
