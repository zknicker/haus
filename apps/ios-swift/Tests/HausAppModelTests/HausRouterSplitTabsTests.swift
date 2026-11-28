import HausModels
import Testing
@testable import HausAppModel

@MainActor
@Suite("Router: You and Search split")
struct HausRouterSplitTabsTests {
    @Test("Split, You opens on General with nothing selected")
    func youOpensOnGeneral() {
        let router = HausRouter()
        router.layout = .split
        router.selectedTab = .you
        #expect(router.panes(.you) == .split(selection: .settings(.general), stack: []))
        #expect(YouStack.row(selection: .settings(.general)) == .general)
        #expect(router.path(.you).isEmpty)
    }

    @Test("Split, a settings row or Drive replaces You's selection; what they push stacks over it")
    func youSelection() {
        let router = HausRouter()
        router.layout = .split
        router.selectedTab = .you
        router.open(.settings(.notifications))
        router.open(.settings(.captains))
        #expect(router.path(.you) == [.settings(.captains)])

        router.setSplitStack([.settings(.agent(id: "a1"))], for: .you)
        #expect(router.panes(.you) == .split(selection: .settings(.captains), stack: [.settings(.agent(id: "a1"))]))

        router.open(YouStack.route(.drive(prefix: "")))
        router.open(.driveFile(path: "projects/"))
        router.open(.driveFile(path: "projects/notes.md"))
        #expect(router.panes(.you) == .split(
            selection: .driveFile(path: ""),
            stack: [.driveFile(path: "projects/"), .driveFile(path: "projects/notes.md")]
        ))
        #expect(YouStack.row(selection: .driveFile(path: "")) == .drive(prefix: ""))
        #expect(YouStack.row(selection: .driveFile(path: "projects/")) == nil)
    }

    @Test("Stacked, a settings row still pushes onto You")
    func youStackedPushes() {
        let router = HausRouter()
        router.selectedTab = .you
        router.open(.settings(.captains))
        router.open(.settings(.agent(id: "a1")))
        #expect(router.path(.you) == [.settings(.captains), .settings(.agent(id: "a1"))])
    }

    @Test("Split, a hit opened inside Search replaces its selection and reveals the match")
    func searchSelection() {
        let router = HausRouter()
        router.layout = .split
        router.selectedTab = .search
        router.open(.channel(chatID: "chat_product", messageID: "msg_1"))
        #expect(router.selectedTab == .search)
        #expect(router.revealedMessageID(in: .chat("chat_product")) == "msg_1")
        #expect(router.visibleConversation == .chat("chat_product"))

        router.open(.dm(chatID: "chat_dm", messageID: "msg_2"))
        #expect(router.path(.search) == [.dm(chatID: "chat_dm", messageID: "msg_2")])
        #expect(router.revealedMessageID(in: .chat("chat_dm")) == "msg_2")

        router.open(.work(.chat("chat_dm")))
        #expect(router.panes(.search) == .split(
            selection: .dm(chatID: "chat_dm", messageID: "msg_2"),
            stack: [.work(.chat("chat_dm"))]
        ))
        #expect(router.path(.home).isEmpty)
    }

    @Test("Search never takes an outside open, and settings leave for You")
    func searchOutsideOpens() {
        let router = HausRouter()
        router.layout = .split
        router.selectedTab = .search
        router.open(.driveFile(path: "notes.md"), from: .outside)
        #expect(router.selectedTab == .home)
        #expect(router.path(.home) == [.driveFile(path: "notes.md")])

        router.selectedTab = .search
        router.open(.settings(.people))
        #expect(router.selectedTab == .you)
        #expect(router.path(.search).isEmpty)

        router.selectedTab = .search
        router.open(.channel(chatID: "chat_product", messageID: "msg_1"), from: .outside)
        #expect(router.selectedTab == .projects)
    }

    @Test("Folding makes each split selection the bottom of its stack, and unfolding splits it again")
    func foldRoundTrip() {
        let router = HausRouter()
        router.layout = .split
        router.selectedTab = .you
        router.open(.settings(.captains))
        router.setSplitStack([.settings(.agent(id: "a1"))], for: .you)
        router.selectedTab = .search
        router.open(.channel(chatID: "chat_product", messageID: "msg_1"))
        router.open(.work(.chat("chat_product")))
        let you = router.path(.you)
        let search = router.path(.search)

        router.layout = .stack
        #expect(router.panes(.you) == .stack([.settings(.captains), .settings(.agent(id: "a1"))]))
        #expect(router.panes(.search) == .stack([.channel(chatID: "chat_product", messageID: "msg_1"), .work(.chat("chat_product"))]))
        #expect(router.topRoute == .work(.chat("chat_product")))
        router.pop()
        #expect(router.topRoute == .channel(chatID: "chat_product", messageID: "msg_1"))
        router.open(.work(.chat("chat_product")))

        router.layout = .split
        #expect(router.path(.you) == you)
        #expect(router.path(.search) == search)
        #expect(router.panes(.search) == .split(
            selection: .channel(chatID: "chat_product", messageID: "msg_1"),
            stack: [.work(.chat("chat_product"))]
        ))
    }

    @Test("Folding with nothing selected in You keeps You at its root")
    func foldEmptyYou() {
        let router = HausRouter()
        router.layout = .split
        #expect(router.panes(.you) == .split(selection: .settings(.general), stack: []))
        router.layout = .stack
        #expect(router.panes(.you) == .stack([]))
    }
}
