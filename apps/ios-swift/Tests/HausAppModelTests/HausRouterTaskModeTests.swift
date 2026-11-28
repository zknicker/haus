import HausModels
import Testing
@testable import HausAppModel

@MainActor
@Suite("Router Task mode")
struct HausRouterTaskModeTests {
    @Test("Split, a Task card opens the Task beside its conversation")
    func cardOpensBeside() {
        let router = HausRouter()
        router.layout = .split
        router.selectedTab = .projects
        router.open(.channel(chatID: "chat_product"))
        router.open(.task(taskID: "task_1"), from: .taskCard)
        #expect(router.path(.projects) == [.channel(chatID: "chat_product"), .task(taskID: "task_1")])
        #expect(router.panes(.projects) == .split(
            selection: .channel(chatID: "chat_product"),
            stack: [],
            side: .task(taskID: "task_1")
        ))
    }

    @Test("A Task from the Tasks list or a link replaces the selection")
    func listAndLinkSelect() {
        let router = HausRouter()
        router.layout = .split
        router.selectedTab = .projects
        router.open(.channel(chatID: "chat_product"))
        router.open(.task(taskID: "task_1"))
        #expect(router.panes(.projects) == .split(selection: .task(taskID: "task_1"), stack: []))

        router.selectedTab = .tasks
        router.open(.task(taskID: "task_2"))
        #expect(router.panes(.tasks) == .split(selection: .task(taskID: "task_2"), stack: []))
    }

    @Test("Another card replaces the Task beside the conversation")
    func cardReplacesSide() {
        let router = HausRouter()
        router.layout = .split
        router.open(.captain(agentID: "agent_1"), from: .outside)
        router.open(.task(taskID: "task_1"), from: .taskCard)
        router.open(.task(taskID: "task_2"), from: .taskCard)
        #expect(router.path(.home) == [.captain(agentID: "agent_1"), .task(taskID: "task_2")])
    }

    @Test("Compact, a card pushes the Task full screen, and unfolding puts it beside")
    func compactPushes() {
        let router = HausRouter()
        router.open(.dm(chatID: "chat_dm"), from: .outside)
        router.open(.task(taskID: "task_1"), from: .taskCard)
        #expect(router.panes(.home) == .stack([.dm(chatID: "chat_dm"), .task(taskID: "task_1")]))
        router.open(.task(taskID: "task_2"), from: .taskCard)
        #expect(router.path(.home).count == 3)

        router.setPath([.dm(chatID: "chat_dm"), .task(taskID: "task_1")], for: .home)
        router.layout = .split
        #expect(router.panes(.home) == .split(selection: .dm(chatID: "chat_dm"), stack: [], side: .task(taskID: "task_1")))
    }

    @Test("Only a Task directly over a conversation sits beside it")
    func sidePaneShape() {
        let router = HausRouter()
        router.layout = .split
        router.selectedTab = .projects
        router.setPath([.channel(chatID: "c"), .work(.chat("c")), .task(taskID: "task_1")], for: .projects)
        #expect(router.panes(.projects) == .split(
            selection: .channel(chatID: "c"),
            stack: [.work(.chat("c")), .task(taskID: "task_1")]
        ))

        router.setPath([.channel(chatID: "c"), .work(.chat("c")), .dm(chatID: "d"), .task(taskID: "task_1")], for: .projects)
        #expect(router.panes(.projects) == .split(
            selection: .channel(chatID: "c"),
            stack: [.work(.chat("c")), .dm(chatID: "d")],
            side: .task(taskID: "task_1")
        ))
    }

    @Test("Beside its conversation, the Task and the conversation are both visible")
    func visibleSet() {
        let router = HausRouter()
        router.selectedTab = .projects
        router.open(.channel(chatID: "chat_product"))
        router.open(.task(taskID: "task_1"), from: .taskCard)
        #expect(router.visibleConversations == [.task("task_1")])

        router.layout = .split
        #expect(router.visibleConversations == [.chat("chat_product"), .task("task_1")])

        router.selectedTab = .home
        #expect(router.visibleConversations.isEmpty)
    }

    @Test("Closing the Task returns to its conversation")
    func closeSide() {
        let router = HausRouter()
        router.layout = .split
        router.selectedTab = .projects
        router.open(.channel(chatID: "chat_product"))
        router.open(.task(taskID: "task_1"), from: .taskCard)
        router.closeSidePane(.projects)
        #expect(router.panes(.projects) == .split(selection: .channel(chatID: "chat_product"), stack: []))
        router.closeSidePane(.projects)
        #expect(router.path(.projects) == [.channel(chatID: "chat_product")])
    }

    @Test("A changed conversation stack closes the Task with it")
    func stackWriteClosesSide() {
        let router = HausRouter()
        router.layout = .split
        router.selectedTab = .projects
        router.setPath([.channel(chatID: "c"), .dm(chatID: "d"), .task(taskID: "task_1")], for: .projects)
        router.setSplitStack([], for: .projects)
        #expect(router.path(.projects) == [.channel(chatID: "c")])
    }
}
