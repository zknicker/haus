import Testing
@testable import HausAppModel

/// Folding the Duo to its outer display and opening it again, with a Task
/// beside its conversation (specs/ios-app.md, Closing the Duo and Pose
/// changes). The router never rewrites a stack; the layout alone changes.
@MainActor
@Suite("Router fold and unfold")
struct HausRouterFoldTests {
    private let channel = HausRoute.channel(chatID: "chat_product")
    private let task = HausRoute.task(taskID: "task_1")

    private func taskMode() -> HausRouter {
        let router = HausRouter()
        router.layout = .split
        router.selectedTab = .projects
        router.open(channel)
        router.open(task, from: .taskCard)
        return router
    }

    @Test("Folded, the outer display shows the Task, and Back returns to the conversation")
    func foldShowsTheTaskOnTop() {
        let router = taskMode()
        router.layout = .stack

        #expect(router.panes(.projects) == .stack([channel, task]))
        #expect(router.topRoute == task)
        #expect(router.visibleConversations == [.task("task_1")])
        #expect(!router.showsTabBar)

        router.pop()
        #expect(router.panes(.projects) == .stack([channel]))
        #expect(router.visibleConversations == [.chat("chat_product")])
    }

    @Test("Unfolding again puts the Task back beside the same conversation")
    func roundTripKeepsTaskMode() {
        let router = taskMode()
        let before = router.panes(.projects)
        let visible = router.visibleConversations

        router.layout = .stack
        router.layout = .split

        #expect(router.panes(.projects) == before)
        #expect(router.visibleConversations == visible)
        #expect(router.path(.projects) == [channel, task])
    }

    @Test("Back on the outer display, then unfolding, leaves the conversation alone selected")
    func backThenUnfold() {
        let router = taskMode()
        router.layout = .stack
        router.pop()
        router.layout = .split

        #expect(router.panes(.projects) == .split(selection: channel, stack: []))
        #expect(router.besideTask(of: channel, in: .projects) == nil)
    }

    @Test("The selection and what stacks over it survive a fold in every tab")
    func otherTabsKeepTheirStacks() {
        let router = taskMode()
        router.selectedTab = .home
        router.open(.captain(agentID: "agent_1"))
        router.open(.work(.chat("chat_captain")))
        let home = router.path(.home)

        router.layout = .stack
        #expect(router.panes(.home) == .stack(home))
        router.layout = .split
        #expect(router.panes(.home) == .split(selection: .captain(agentID: "agent_1"), stack: [.work(.chat("chat_captain"))]))
        #expect(router.path(.projects) == [channel, task])
    }

    @Test("The chip's composer, folded, is the Task chat's own: one draft follows the Task")
    func draftFollowsTheTaskAcrossTheFold() {
        let router = taskMode()
        let drafts = ComposerDraftStore(makeStaged: StagedFiles.init, discardStaged: { _ in })
        let conversation = ComposerDraftKey(serverID: "srv_a", destination: .chat("chat_product"))

        let chip = drafts.target(conversation, beside: router.besideTask(of: channel, in: .projects))
        #expect(chip == .task("task_1"))
        drafts.setText("Keep 3XL under $30", for: ComposerDraftKey(serverID: "srv_a", destination: chip))
        drafts.setText("Looks good", for: conversation)

        router.layout = .stack
        #expect(router.besideTask(of: channel, in: .projects) == nil)
        #expect(drafts.target(conversation, beside: router.besideTask(of: channel, in: .projects)) == .chat("chat_product"))
        #expect(drafts.text(for: ComposerDraftKey(serverID: "srv_a", destination: .task("task_1"))) == "Keep 3XL under $30")
        #expect(drafts.text(for: conversation) == "Looks good")

        router.layout = .split
        #expect(drafts.target(conversation, beside: router.besideTask(of: channel, in: .projects)) == .task("task_1"))
    }

    @Test("A chip let go before the fold stays let go after it")
    func releasedChipSurvivesTheFold() {
        let router = taskMode()
        let drafts = ComposerDraftStore(makeStaged: StagedFiles.init, discardStaged: { _ in })
        let conversation = ComposerDraftKey(serverID: "srv_a", destination: .chat("chat_product"))
        drafts.release(conversation, from: "task_1")

        router.layout = .stack
        router.layout = .split

        #expect(drafts.target(conversation, beside: router.besideTask(of: channel, in: .projects)) == .chat("chat_product"))
    }

    @Test("Half open to closed and back: stacks torn down by the swap write nothing, so the Task, its chip and its draft stay")
    func halfOpenToClosedIgnoresTornDownStacks() {
        let router = taskMode()
        let drafts = ComposerDraftStore(makeStaged: StagedFiles.init, discardStaged: { _ in })
        let conversation = ComposerDraftKey(serverID: "srv_a", destination: .chat("chat_product"))
        let chip = ComposerDraftKey(serverID: "srv_a", destination: drafts.target(conversation, beside: router.besideTask(of: channel, in: .projects)))
        drafts.setText("Fold draft check", for: chip)

        router.layout = .stack
        router.setSplitStack([], for: .projects)
        #expect(router.panes(.projects) == .stack([channel, task]))

        router.layout = .split
        router.setStackPath([], for: .projects)
        router.layout = .stack
        router.setSplitStack([], for: .projects)

        #expect(router.path(.projects) == [channel, task])
        #expect(router.topRoute == task)
        #expect(drafts.text(for: ComposerDraftKey(serverID: "srv_a", destination: .task("task_1"))) == "Fold draft check")

        router.layout = .split
        #expect(router.besideTask(of: channel, in: .projects) == "task_1")
        #expect(drafts.target(conversation, beside: router.besideTask(of: channel, in: .projects)) == chip.destination)
    }

    @Test("Folded, the stack on screen still pops and pushes")
    func compactStackWritesWhileFolded() {
        let router = taskMode()
        router.layout = .stack
        router.stackAppeared(.projects)
        router.setStackPath([channel], for: .projects)
        #expect(router.path(.projects) == [channel])
        router.setStackPath([], for: .projects)
        #expect(router.path(.projects).isEmpty)
    }

    @Test("The stack the fold rebuilds can't empty itself before its top screen appears")
    func rebuiltStackKeepsItsRoutesUntilSeen() {
        let router = taskMode()
        let revision = router.stackRevision
        router.layout = .stack

        #expect(!router.setStackPath([], for: .projects))
        #expect(router.path(.projects) == [channel, task])
        #expect(router.stackRevision == revision + 1)

        #expect(!router.setStackPath([], for: .projects))
        #expect(router.stackRevision == revision + 1)

        router.stackAppeared(.projects)
        #expect(router.setStackPath([], for: .projects))
        #expect(router.path(.projects).isEmpty)
    }

    @Test("Back pops one screen even before the rebuilt stack's top has appeared")
    func backPopsOneWhileUnseen() {
        let router = taskMode()
        router.layout = .stack
        #expect(router.setStackPath([channel], for: .projects))
        #expect(router.path(.projects) == [channel])
    }

    @Test("Each fold marks the stacks it rebuilds unseen again")
    func eachFoldMarksUnseen() {
        let router = taskMode()
        router.layout = .stack
        router.stackAppeared(.projects)
        router.layout = .split
        router.layout = .stack
        #expect(!router.setStackPath([], for: .projects))
        #expect(router.path(.projects) == [channel, task])
    }

    @Test("Only the conversation right under the Task carries its chip")
    func onlyTheConversationBeneath() {
        let router = taskMode()
        #expect(router.besideTask(of: channel, in: .projects) == "task_1")
        #expect(router.besideTask(of: task, in: .projects) == nil)
        #expect(router.besideTask(of: channel, in: .home) == nil)
    }
}
