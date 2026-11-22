import HausModels
import SwiftUI

extension SearchPaletteView {
    @ViewBuilder
    func sections(now: Date) -> some View {
        if SearchPalette.trimmed(query).isEmpty {
            zeroQuery(now: now)
        } else {
            results(now: now)
        }
    }

    @ViewBuilder
    private func zeroQuery(now: Date) -> some View {
        switch scope {
        case nil:
            if !content.captains.isEmpty {
                captainSection(content.captains)
            }
            if let tasks = content.tasks, !tasks.isEmpty {
                taskSection("Recent", Array(SearchPalette.recent(tasks).prefix(SearchPalette.recentLimit)), now: now)
            }
            WorkListSection("Actions", count: nil) {
                ForEach(SearchPaletteAction.allCases, id: \.self) { action in
                    rowButton { perform(action) } label: { SearchActionRow(action: action) }
                }
            }
        case .messages:
            quietLine("Search messages anyone has sent.")
        case .some(let scope):
            localSection(scope, limit: nil, now: now)
        }
    }

    @ViewBuilder
    private func results(now: Date) -> some View {
        let limit = scope == nil ? SearchPalette.sectionLimit : nil
        ForEach(SearchPalette.localScopes(scope), id: \.self) { scope in
            localSection(scope, limit: limit, now: now)
        }
        if SearchPalette.searchesMessages(scope), !search.results.isEmpty {
            WorkListSection("Messages", count: nil) {
                ForEach(search.results) { result in
                    rowButton {
                        if !onSelectMessage(result) {
                            selectionError = "That message’s chat is no longer in this Server."
                        }
                    } label: {
                        MessageSearchResultRow(result: result, query: query).padding(.vertical, 8)
                    }
                }
            }
        }
        if let error = search.error, SearchPalette.searchesMessages(scope) {
            SearchErrorBanner(message: error) { retryToken += 1 }
        } else if showsNoMatches {
            quietLine("No matches. Try a different word.")
        }
    }

    @ViewBuilder
    private func localSection(_ scope: SearchScope, limit: Int?, now: Date) -> some View {
        switch scope {
        case .captains:
            let captains = capped(SearchPalette.captains(content.captains, query: query), limit)
            if !captains.isEmpty { captainSection(captains) }
        case .projects:
            let projects = capped(SearchPalette.projects(chats, query: query), limit)
            if !projects.isEmpty {
                WorkListSection("Projects", count: nil) {
                    ForEach(projects) { project in
                        rowButton { onSelectChat(project) } label: { SearchProjectRow(project: project) }
                    }
                }
            }
        case .tasks:
            let tasks = capped(SearchPalette.tasks(content.tasks ?? [], query: query), limit)
            if !tasks.isEmpty { taskSection("Tasks", tasks, now: now) }
        case .people:
            let people = capped(SearchPalette.people(content.people, query: query), limit)
            if !people.isEmpty {
                WorkListSection("People", count: nil) {
                    ForEach(people) { person in
                        rowButton { open(person) } label: { SearchPersonRow(person: person) }
                    }
                }
            }
        case .messages:
            EmptyView()
        }
    }

    private func captainSection(_ captains: [SearchCaptain]) -> some View {
        WorkListSection("Captains", count: nil) {
            ForEach(captains) { captain in
                rowButton { actions.onSelectCaptain(captain.id) } label: { SearchCaptainRow(captain: captain) }
            }
        }
    }

    private func taskSection(_ title: String, _ tasks: [SearchTask], now: Date) -> some View {
        WorkListSection(title, count: nil) {
            ForEach(tasks) { task in
                rowButton { actions.onSelectTask(task.id) } label: { SearchTaskRow(task: task, now: now) }
            }
        }
    }

    private func rowButton(action: @escaping () -> Void, @ViewBuilder label: () -> some View) -> some View {
        Button(action: action, label: label)
            .buttonStyle(.pressableRow)
    }

    private func quietLine(_ text: String) -> some View {
        Text(text)
            .hausFont(.sectionLabel)
            .foregroundStyle(HausPlatformColor.mutedInk)
            .padding(.top, 28)
    }

    /// Nothing local matched and the message search, if it ran, found nothing.
    private var showsNoMatches: Bool {
        let localEmpty = SearchPalette.localScopes(scope).allSatisfy { scope in
            switch scope {
            case .captains: SearchPalette.captains(content.captains, query: query).isEmpty
            case .projects: SearchPalette.projects(chats, query: query).isEmpty
            case .tasks: SearchPalette.tasks(content.tasks ?? [], query: query).isEmpty
            case .people: SearchPalette.people(content.people, query: query).isEmpty
            case .messages: true
            }
        }
        guard localEmpty else { return false }
        return SearchPalette.searchesMessages(scope) ? search.hasSearched && search.results.isEmpty : true
    }

    private func open(_ person: SearchPerson) {
        if let chat = SearchPalette.directMessage(with: person, in: chats) {
            onSelectChat(chat)
        } else {
            actions.onOpenPeople()
        }
    }

    private func perform(_ action: SearchPaletteAction) {
        switch action {
        case .newTask: actions.onNewTask()
        case .newProject: actions.onNewProject()
        case .goToTasks: actions.onGoToTasks()
        case .goToSettings: actions.onGoToSettings()
        }
    }

    private func capped<Item>(_ items: [Item], _ limit: Int?) -> [Item] {
        limit.map { Array(items.prefix($0)) } ?? items
    }
}

enum SearchPaletteFixtures {
    static let blippy = SearchCaptain(id: "agent-blippy", name: "Blippy")
    static let tiny = SearchCaptain(id: "agent-tiny", name: "Tiny", isWorking: true)

    static let content = SearchPaletteContent(
        captains: [blippy, tiny],
        people: [SearchPerson(id: "user-mia", name: "Mia Chen", handle: "mia")],
        tasks: [
            SearchTask(
                id: "task-41", key: "HAUS-41", title: "iPhone tab bar shell", state: .open,
                captain: blippy, updatedAt: .now
            ),
            SearchTask(
                id: "task-44", key: "HAUS-44", title: "Pick the Duo inner layout", state: .todo,
                captain: tiny, updatedAt: .now.addingTimeInterval(-7_200)
            ),
        ]
    )
}
