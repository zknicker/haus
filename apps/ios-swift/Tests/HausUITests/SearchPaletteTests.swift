import Foundation
import HausModels
@testable import HausUI
import Testing

struct SearchPaletteTests {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    @Test func everyLocalScopeSharesTheScreenUntilAChipNarrowsIt() {
        #expect(SearchPalette.localScopes(nil) == [.captains, .projects, .tasks, .people])
        #expect(SearchPalette.localScopes(.tasks) == [.tasks])
        #expect(SearchPalette.localScopes(.messages).isEmpty)
    }

    @Test func onlyTheMessagesScopeOrNoScopeAsksTheServer() {
        #expect(SearchPalette.searchesMessages(nil))
        #expect(SearchPalette.searchesMessages(.messages))
        #expect(!SearchPalette.searchesMessages(.captains))
    }

    @Test func prefixMatchesComeFirstAndAnEmptyQueryKeepsEverything() {
        let captains = [SearchCaptain(id: "a", name: "Tiny Blippy"), SearchCaptain(id: "b", name: "Blippy")]
        #expect(SearchPalette.captains(captains, query: "blip").map(\.id) == ["b", "a"])
        #expect(SearchPalette.captains(captains, query: "  ").map(\.id) == ["a", "b"])
        #expect(SearchPalette.captains(captains, query: "zz").isEmpty)
    }

    @Test func projectsAreChannelsNotDirectMessages() {
        let agent = AgentPresentation(id: "agent-p", name: "Product Bot", avatarURL: nil, presence: .idle)
        let chats = [
            ChatPresentation(id: "c", title: "product", kind: .channel),
            ChatPresentation(id: "d", title: "Product Bot", kind: .captainChat(agent)),
        ]
        #expect(SearchPalette.projects(chats, query: "prod").map(\.id) == ["c"])
    }

    @Test func peopleMatchByHandleToo() {
        let people = [SearchPerson(id: "u", name: "Mia Chen", handle: "mchen"), SearchPerson(id: "v", name: "Ola")]
        #expect(SearchPalette.people(people, query: "mchen").map(\.id) == ["u"])
        #expect(SearchPalette.people(people, query: "ola").map(\.id) == ["v"])
    }

    @Test func tasksMatchTitleOrShortIDAndListNewestFirst() {
        let older = task("t1", shortID: "k3mq7xta", title: "Tab bar shell", age: 7_200)
        let newer = task("t2", shortID: "p8vd2nrw", title: "Duo layout", age: 60)
        #expect(SearchPalette.tasks([older, newer], query: "").map(\.id) == ["t2", "t1"])
        #expect(SearchPalette.tasks([older, newer], query: "k3mq").map(\.id) == ["t1"])
        #expect(SearchPalette.tasks([older, newer], query: "layout").map(\.id) == ["t2"])
    }

    @Test func aPersonOpensTheirExistingDirectMessage() {
        let mia = SearchPerson(id: "user-mia", name: "Mia")
        let human = HumanPresentation(id: "user-mia", name: "Mia", handle: nil, avatarURL: nil)
        let dm = ChatPresentation(id: "dm-mia", title: "Mia", kind: .humanDirectMessage(human))
        #expect(SearchPalette.directMessage(with: mia, in: [dm])?.id == "dm-mia")
        #expect(SearchPalette.directMessage(with: SearchPerson(id: "user-ola", name: "Ola"), in: [dm]) == nil)
    }

    @Test func everyScopeHasItsChipTitleInMockOrder() {
        #expect(SearchScope.allCases.map(\.title) == ["Messages", "Tasks", "Captains", "Projects", "People"])
        #expect(SearchPaletteAction.allCases.map(\.title) == ["New task", "New project", "Go to tasks", "Go to settings"])
    }

    private func task(_ id: String, shortID: String, title: String, age: TimeInterval) -> SearchTask {
        SearchTask(
            id: id, shortID: shortID, title: title, disc: .active(.working), captain: nil,
            updatedAt: now.addingTimeInterval(-age)
        )
    }
}
