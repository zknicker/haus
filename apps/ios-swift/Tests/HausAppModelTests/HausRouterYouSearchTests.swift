import HausModels
import Testing
@testable import HausAppModel

@MainActor
@Suite("Router: You and Search")
struct HausRouterYouSearchTests {
    @Test("Drive opened inside You stacks in You")
    func youHoldsDrive() {
        let router = HausRouter()
        router.selectedTab = .you
        router.setPath(YouStack.path([], writing: [.drive(prefix: "")]), for: .you)
        router.open(.driveFile(path: "projects/"))
        router.open(.driveFile(path: "projects/notes.md"))
        #expect(router.selectedTab == .you)
        #expect(router.path(.you) == [
            .driveFile(path: ""), .driveFile(path: "projects/"), .driveFile(path: "projects/notes.md"),
        ])
        #expect(router.path(.home).isEmpty)
    }

    @Test("A Drive file opened from outside in You stays in You")
    func outsideDriveStaysInYou() {
        let router = HausRouter()
        router.selectedTab = .you
        router.open(.driveFile(path: "notes.md"), from: .outside)
        #expect(router.selectedTab == .you)
        #expect(router.path(.you) == [.driveFile(path: "notes.md")])
    }

    @Test("Closing Search returns to the tab it was opened from")
    func closeSearchReturns() {
        let router = HausRouter()
        router.selectedTab = .projects
        router.selectedTab = .search
        router.closeSearch()
        #expect(router.selectedTab == .projects)

        router.selectedTab = .you
        router.selectedTab = .search
        router.selectedTab = .search
        router.closeSearch()
        #expect(router.selectedTab == .you)
    }

    @Test("Closing Search with nothing before it lands in Home")
    func closeSearchDefaultsHome() {
        let router = HausRouter()
        router.selectedTab = .search
        router.closeSearch()
        #expect(router.selectedTab == .home)
    }

    @Test("The hub's pushes and pops keep You's Drive routes")
    func youStackWrites() {
        let base: [HausRoute] = [.settings(.captains), .settings(.agent(id: "a1"))]
        #expect(YouStack.settings(in: base) == [.captains, .agent(id: "a1")])
        #expect(YouStack.path(base, writing: [.captains, .agent(id: "a1"), .agentRuntime(id: "a1")])
            == base + [.settings(.agentRuntime(id: "a1"))])
        #expect(YouStack.path(base, writing: [.captains]) == [.settings(.captains)])
        #expect(YouStack.path(base, writing: [.people]) == [.settings(.people)])

        let drive: [HausRoute] = [.driveFile(path: ""), .driveFile(path: "haus/")]
        #expect(YouStack.settings(in: drive).isEmpty)
        #expect(YouStack.path(drive, writing: []) == drive)
        #expect(YouStack.path([], writing: [.drive(prefix: "haus")]) == [.driveFile(path: "haus/")])
    }
}
