import HausModels
import Testing
@testable import HausAppModel

@MainActor
@Suite("Router")
struct HausRouterTests {
    @Test("A route opened inside a tab pushes onto that tab's stack")
    func insidePushes() {
        let router = HausRouter()
        router.selectedTab = .projects
        router.open(.channel(chatID: "chat_product"))
        router.open(.task(taskID: "task_1"))
        #expect(router.selectedTab == .projects)
        #expect(router.path(.projects) == [.channel(chatID: "chat_product"), .task(taskID: "task_1")])
        #expect(router.path(.tasks).isEmpty)
    }

    @Test("Opening the route already on top pushes nothing")
    func insideDeduplicates() {
        let router = HausRouter()
        router.open(.captainDM(agentID: "agent_1"))
        router.open(.captainDM(agentID: "agent_1"))
        #expect(router.path(.home) == [.captainDM(agentID: "agent_1")])
    }

    @Test(
        "A route opened from outside selects its tab and replaces that stack",
        arguments: [
            (HausRoute.captainDM(agentID: "agent_1"), HausTab.home),
            (.dm(chatID: "chat_dm"), .home),
            (.channel(chatID: "chat_product"), .projects),
            (.task(taskID: "task_1"), .tasks),
            (.settings(.computers), .you),
            (.projectSettings(projectID: "chat_product"), .projects),
        ]
    )
    func outsideResets(route: HausRoute, tab: HausTab) {
        let router = HausRouter()
        router.selectedTab = tab == .home ? .projects : .home
        router.setPath([.worker(workerID: "w_1"), .work(.chat("c"))], for: tab == .you ? .home : tab)
        router.open(route, from: .outside)
        #expect(router.selectedTab == tab)
        #expect(router.path(tab) == [route])
    }

    @Test("A route without a tab opens from outside in the current tab")
    func outsideTablessStaysInTab() {
        let router = HausRouter()
        router.selectedTab = .tasks
        router.open(.worker(workerID: "w_1"), from: .outside)
        #expect(router.selectedTab == .tasks)
        #expect(router.path(.tasks) == [.worker(workerID: "w_1")])
    }

    @Test("You holds only settings, and Search opens results in their own tabs")
    func tabsThatCannotHoldARoute() {
        let router = HausRouter()
        router.selectedTab = .you
        router.open(.settings(.people))
        router.open(.channel(chatID: "chat_product"))
        #expect(router.path(.you) == [.settings(.people)])
        #expect(router.selectedTab == .projects)

        router.selectedTab = .search
        router.open(.dm(chatID: "chat_dm", messageID: "m_1"))
        #expect(router.selectedTab == .home)
        #expect(router.path(.home) == [.dm(chatID: "chat_dm", messageID: "m_1")])

        router.selectedTab = .tasks
        router.open(.settings(.appInfo))
        #expect(router.selectedTab == .you)
        #expect(router.path(.you) == [.settings(.appInfo)])
        #expect(router.path(.tasks).isEmpty)
    }

    @Test("Any open closes the sheet")
    func openClosesSheet() {
        let router = HausRouter()
        router.present(.askAnything)
        router.open(.task(taskID: "task_1"), from: .outside)
        #expect(router.sheet == nil)
    }

    @Test("A message id is revealed once, in its own conversation")
    func revealsMessage() {
        let router = HausRouter()
        router.open(.channel(chatID: "chat_product", messageID: "m_9"), from: .outside)
        #expect(router.revealedMessageID(in: .chat("chat_product")) == "m_9")
        #expect(router.revealedMessageID(in: .chat("chat_other")) == nil)
        router.finishReveal()
        #expect(router.revealedMessageID(in: .chat("chat_product")) == nil)

        router.open(.task(taskID: "task_1", messageID: "m_2"), from: .outside)
        #expect(router.revealedMessageID(in: .task("task_1")) == "m_2")
        router.open(.task(taskID: "task_2"))
        #expect(router.revealedMessageID(in: .task("task_1")) == nil)
    }

    @Test("Only the selected tab's top route is the visible conversation")
    func visibleConversation() {
        let router = HausRouter()
        router.selectedTab = .projects
        router.open(.channel(chatID: "chat_product"))
        router.open(.task(taskID: "task_1"))
        #expect(router.visibleConversation == .task("task_1"))
        router.open(.work(.task("task_1")))
        #expect(router.visibleConversation == nil)
        router.pop()
        router.selectedTab = .home
        #expect(router.visibleConversation == nil)
        router.selectedTab = .projects
        #expect(router.visibleConversation == .task("task_1"))
    }

    @Test("Chat routes hide the tab bar; lists and settings keep it")
    func tabBarFollowsTopRoute() {
        let router = HausRouter()
        #expect(router.showsTabBar)
        router.open(.captainDM(agentID: "agent_1"))
        #expect(!router.showsTabBar)
        router.open(.work(.chat("chat_dm")))
        #expect(router.showsTabBar)
        router.open(.worker(workerID: "w_1"))
        #expect(!router.showsTabBar)
    }

    @Test("Switching Servers resets every stack; adopting the first Server does not")
    func serverSwitchResets() {
        let router = HausRouter()
        router.open(.task(taskID: "task_1"), from: .outside)
        router.adopt(serverID: "srv_a")
        #expect(router.path(.tasks) == [.task(taskID: "task_1")])
        router.present(.newProject)
        router.tasksFilter = .assignedToMe
        router.adopt(serverID: "srv_a")
        #expect(router.sheet == .newProject)
        router.adopt(serverID: "srv_b")
        #expect(router.paths.isEmpty)
        #expect(router.sheet == nil)
        #expect(router.tasksFilter == .following)
        #expect(router.selectedTab == .tasks)
    }

    @Test("A stack written back by the NavigationStack replaces the router's")
    func setPathFromStack() {
        let router = HausRouter()
        router.open(.channel(chatID: "c"), from: .outside)
        router.setPath([], for: .projects)
        #expect(router.paths[.projects] == nil)
        #expect(router.topRoute == nil)
    }

    @Test("A conversation resolves to the Chat behind it")
    func conversationChatID() {
        let captain = { (agentID: String) in agentID == "agent_1" ? "chat_dm_1" : nil }
        let task = { (taskID: String) in taskID == "task_1" ? "chat_task_1" : nil }
        #expect(HausConversation.chat("c").chatID(captainChat: captain, taskChat: task) == "c")
        #expect(HausConversation.captain("agent_1").chatID(captainChat: captain, taskChat: task) == "chat_dm_1")
        #expect(HausConversation.captain("agent_2").chatID(captainChat: captain, taskChat: task) == nil)
        #expect(HausConversation.task("task_1").chatID(captainChat: captain, taskChat: task) == "chat_task_1")
    }
}
