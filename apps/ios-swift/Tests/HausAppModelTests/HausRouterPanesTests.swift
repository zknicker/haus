import HausModels
import Testing
@testable import HausAppModel

@MainActor
@Suite("Router panes")
struct HausRouterPanesTests {
    @Test("Folding and unfolding keep every stack and what is open")
    func layoutChangeKeepsStacks() {
        let router = HausRouter()
        router.selectedTab = .projects
        router.open(.channel(chatID: "chat_product"))
        router.open(.task(taskID: "task_1"))
        router.open(.worker(workerID: "w_1"))
        router.open(.dm(chatID: "chat_dm"), from: .outside)
        let projects = router.path(.projects)
        let home = router.path(.home)

        router.layout = .split
        #expect(router.path(.projects) == projects)
        #expect(router.path(.home) == home)
        #expect(router.selectedTab == .home)

        router.layout = .stack
        #expect(router.panes(.projects) == .stack(projects))
        #expect(router.panes(.home) == .stack(home))
    }

    @Test("Compact width stacks every tab; regular width splits Home, Projects, and Tasks")
    func panesPerLayout() {
        let router = HausRouter()
        router.open(.channel(chatID: "chat_product"), from: .outside)
        router.open(.settings(.people), from: .outside)
        #expect(router.panes(.projects) == .stack([.channel(chatID: "chat_product")]))
        #expect(router.panes(.home) == .stack([]))

        router.layout = .split
        #expect(router.panes(.projects) == .split(selection: .channel(chatID: "chat_product"), stack: [], side: nil))
        #expect(router.panes(.home) == .split(selection: nil, stack: [], side: nil))
        #expect(router.panes(.tasks) == .split(selection: nil, stack: [], side: nil))
        #expect(router.panes(.you) == .stack([.settings(.people)]))
        #expect(router.panes(.search) == .stack([]))
    }

    @Test("Split, a conversation opened inside replaces the selection; anything else stacks over it")
    func splitOpens() {
        let router = HausRouter()
        router.layout = .split
        router.selectedTab = .projects
        router.open(.channel(chatID: "chat_product"))
        router.open(.channel(chatID: "chat_haus"))
        #expect(router.path(.projects) == [.channel(chatID: "chat_haus")])

        router.open(.work(.chat("chat_haus")))
        router.open(.driveFile(path: "notes.md"))
        #expect(router.panes(.projects) == .split(
            selection: .channel(chatID: "chat_haus"),
            stack: [.work(.chat("chat_haus")), .driveFile(path: "notes.md")],
            side: nil
        ))

        router.open(.task(taskID: "task_1"))
        #expect(router.path(.projects) == [.task(taskID: "task_1")])
    }

    @Test("A Worker opened from its Task sits beside it; from anywhere else it stacks")
    func workerSidePane() {
        let router = HausRouter()
        router.layout = .split
        router.open(.task(taskID: "task_1"), from: .outside)
        router.open(.worker(workerID: "w_1"))
        #expect(router.panes(.tasks) == .split(selection: .task(taskID: "task_1"), stack: [], side: .worker(workerID: "w_1")))

        router.selectedTab = .projects
        router.open(.channel(chatID: "chat_product"))
        router.open(.worker(workerID: "w_2"))
        #expect(router.panes(.projects) == .split(
            selection: .channel(chatID: "chat_product"),
            stack: [.worker(workerID: "w_2")],
            side: nil
        ))
    }

    @Test("The content pane's stack writes back over the selection, closing the side pane")
    func splitStackWrites() {
        let router = HausRouter()
        router.layout = .split
        router.selectedTab = .projects
        router.setPath([.channel(chatID: "c"), .task(taskID: "task_1"), .worker(workerID: "w_1")], for: .projects)
        #expect(router.panes(.projects) == .split(
            selection: .channel(chatID: "c"),
            stack: [.task(taskID: "task_1")],
            side: .worker(workerID: "w_1")
        ))

        router.setSplitStack([.task(taskID: "task_1")], for: .projects)
        #expect(router.path(.projects).count == 3)

        router.setSplitStack([], for: .projects)
        #expect(router.path(.projects) == [.channel(chatID: "c")])

        router.setPath([], for: .projects)
        router.setSplitStack([.task(taskID: "task_1")], for: .projects)
        #expect(router.path(.projects).isEmpty)
    }

    @Test("Beside a Worker, the Task chat is the visible conversation")
    func visibleBesideSide() {
        let router = HausRouter()
        router.open(.task(taskID: "task_1"), from: .outside)
        router.open(.worker(workerID: "w_1"))
        #expect(router.visibleConversation == nil)
        router.layout = .split
        #expect(router.visibleConversation == .task("task_1"))
        router.pop()
        #expect(router.visibleConversation == .task("task_1"))
    }
}
