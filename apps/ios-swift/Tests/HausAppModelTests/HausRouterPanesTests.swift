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
        router.open(.work(.task("task_1")))
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

    @Test("Compact width stacks every tab; regular width splits every tab")
    func panesPerLayout() {
        let router = HausRouter()
        router.open(.channel(chatID: "chat_product"), from: .outside)
        router.open(.settings(.people), from: .outside)
        #expect(router.panes(.projects) == .stack([.channel(chatID: "chat_product")]))
        #expect(router.panes(.home) == .stack([]))
        #expect(router.panes(.you) == .stack([.settings(.people)]))
        #expect(router.panes(.search) == .stack([]))

        router.layout = .split
        #expect(router.panes(.projects) == .split(selection: .channel(chatID: "chat_product"), stack: []))
        #expect(router.panes(.home) == .split(selection: nil, stack: []))
        #expect(router.panes(.tasks) == .split(selection: nil, stack: []))
        #expect(router.panes(.you) == .split(selection: .settings(.people), stack: []))
        #expect(router.panes(.search) == .split(selection: nil, stack: []))
        #expect(HausTab.allCases.allSatisfy { tab in
            if case .split = router.panes(tab) { true } else { false }
        })
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
            stack: [.work(.chat("chat_haus")), .driveFile(path: "notes.md")]
        ))

        router.open(.task(taskID: "task_1"))
        #expect(router.path(.projects) == [.task(taskID: "task_1")])
    }

    @Test("The content pane's stack writes back over the selection")
    func splitStackWrites() {
        let router = HausRouter()
        router.layout = .split
        router.selectedTab = .projects
        router.setPath([.channel(chatID: "c"), .work(.chat("c"))], for: .projects)
        #expect(router.panes(.projects) == .split(selection: .channel(chatID: "c"), stack: [.work(.chat("c"))]))

        router.setSplitStack([.work(.chat("c")), .driveFile(path: "notes.md")], for: .projects)
        #expect(router.path(.projects).count == 3)

        router.setSplitStack([], for: .projects)
        #expect(router.path(.projects) == [.channel(chatID: "c")])

        router.setPath([], for: .projects)
        router.setSplitStack([.task(taskID: "task_1")], for: .projects)
        #expect(router.path(.projects).isEmpty)
    }

    @Test("Split, the top of the selected tab's stack is the visible conversation")
    func visibleInSplit() {
        let router = HausRouter()
        router.open(.task(taskID: "task_1"), from: .outside)
        router.layout = .split
        #expect(router.visibleConversations == [.task("task_1")])
        router.open(.work(.task("task_1")))
        #expect(router.visibleConversations.isEmpty)
        router.pop()
        #expect(router.visibleConversations == [.task("task_1")])
    }
}
