import HausAppModel
import HausModels
import HausUI
import SwiftUI

/// The list column's state, kept per Server, and the rail each tab draws in
/// its place (specs/ios-app.md, iPhone Duo). Search has no rail.
extension AuthenticatedHausView {
    var listColumn: Binding<ListColumn> {
        let columns = store.lifecycle.listColumns
        let serverID = store.activeServer?.id
        return Binding(
            get: { columns.column(serverID: serverID) },
            set: { column in
                guard let serverID else { return }
                withAnimation(.smooth(duration: 0.3)) { columns.save(column, serverID: serverID) }
            }
        )
    }

    @ViewBuilder
    func rail(_ tab: HausTab) -> some View {
        switch tab {
        case .home:
            ListRail(items: homeRail, onCompose: askAnything, onSelect: openHomeRow)
        case .projects:
            ListRail(
                items: ListRails.projects(store.projectRows, selectedChatID: selectedChatID(.projects)),
                onCompose: askAnything,
                onSelect: { router.open(route(forChatID: $0)) }
            )
        case .tasks:
            ListRail(
                items: ListRails.tasks(
                    store.taskListContent(for: router.tasksView),
                    view: router.tasksView,
                    selectedTaskID: selectedTaskRail
                ),
                onCompose: askAnything,
                onSelect: { router.open(.task(taskID: $0, messageID: nil)) }
            )
        case .you:
            ListRail(items: youRail, onCompose: nil, onSelect: { router.open(YouStack.route($0)) })
        case .search:
            EmptyView()
        }
    }

    private var homeRail: [ListRailItem<HomeRowTarget>] {
        let working = Set(store.captainTiles.filter(\.isWorking).map(\.id))
        return ListRails.home(store.homeRecentRows ?? [], workingCaptainIDs: working, selected: selectedHomeTarget)
    }

    private var youRail: [ListRailItem<SettingsRoute>] {
        guard let data = store.settingsData else { return [] }
        return ListRails.you(data, selected: YouStack.row(selection: railSelection(.you)))
    }

    private var askAnything: () -> Void {
        { router.present(.askAnything) }
    }

    private func railSelection(_ tab: HausTab) -> HausRoute? {
        guard case let .split(selection, _, _) = router.panes(tab) else { return nil }
        return selection
    }

    var selectedHomeTarget: HomeRowTarget? {
        switch railSelection(.home)?.conversation {
        case .captain(let agentID)?: .captain(agentID)
        case .chat(let chatID)?: .chat(chatID)
        case .task(let taskID)?: .task(taskID)
        case nil: nil
        }
    }

    private func selectedChatID(_ tab: HausTab) -> String? {
        if case .chat(let chatID)? = railSelection(tab)?.conversation { chatID } else { nil }
    }

    private var selectedTaskRail: String? {
        if case .task(let taskID)? = railSelection(.tasks)?.conversation { taskID } else { nil }
    }
}
