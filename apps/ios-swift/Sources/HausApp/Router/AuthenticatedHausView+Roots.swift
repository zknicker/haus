import HausAppModel
import HausModels
import HausUI
import OSLog
import SwiftUI

/// Each tab's root screen, re-homed from the drawer, the Inbox, and the
/// Settings sheet as they were.
extension AuthenticatedHausView {
    var homeRoot: some View {
        HomeTabView(
            firstRun: firstRun,
            tiles: store.captainTiles,
            recent: store.homeRecentRows,
            activeTasks: store.homeActiveTaskRows,
            selected: selectedHomeTarget,
            tileActions: captainTileActions,
            onOpen: openHomeRow,
            onMarkRead: { chatID in Task { await store.markInboxRowRead(id: chatID) } },
            onRefresh: refreshHome,
            onNewCaptain: store.canManageServer ? { router.present(.newCaptain) } : nil
        )
        .toolbar { askAnythingCompose }
    }

    var projectsRoot: some View {
        ProjectsTabView(
            projects: store.projectRows,
            people: store.personRows,
            captains: store.agents.map(store.captainIdentity),
            archivedCount: store.projects.archivedCount,
            isLoaded: store.hasLoadedChats,
            selectedChatID: selectedProjectsChatID,
            actions: projectsTabActions
        )
        .toolbar { askAnythingCompose }
    }

    var tasksRoot: some View {
        TasksTabScreen(
            store: store,
            view: $router.tasksView,
            selectedTaskID: selectedTaskID,
            onOpenTask: { router.open(.task(taskID: $0, messageID: nil)) },
            onNewTask: { router.present(.askAnything) }
        )
    }

    /// Settings and the Drive it browses, on one stack: the hub pushes its
    /// own screens, and Drive opens through the router.
    var youStack: some View {
        NavigationStack(path: navigationPath({ router.path(.you) }) { router.setPath($0, for: .you) }) {
            youRoot
                .foldsBottomChrome(.you, router: router)
                .navigationDestination(for: HausRoute.self) { routeDestination($0) }
        }
    }

    /// You's root: the hub, which beside the content pane selects a row
    /// instead of pushing it.
    var youRoot: some View {
        settings(root: nil, selection: youListSelection)
    }

    /// A settings screen as the selection beside You's list.
    func settingsDestination(_ route: SettingsRoute) -> some View {
        settings(root: route, selection: nil)
    }

    private var youListSelection: SettingsListSelection? {
        guard case let .split(selection, _, _) = router.panes(.you) else { return nil }
        return SettingsListSelection(route: YouStack.row(selection: selection)) { router.open(YouStack.route($0)) }
    }

    @ViewBuilder
    private func settings(root: SettingsRoute?, selection: SettingsListSelection?) -> some View {
        if let data = store.settingsData {
            SettingsSheet(
                root: root,
                selection: selection,
                tabPath: settingsPath,
                data: data,
                persistence: store.settingsPersistence,
                automations: store.agentAutomations { router.open(route(forChatID: $0), from: .outside) },
                stoppedClaims: store.agentStoppedClaims { openClaim($0) },
                notifications: push.setting,
                server: store.settingsServerContent { router.open(.driveFile(path: $0.metadata.path)) },
                appearance: appearanceBinding,
                serverSwitcher: ServerSwitcher(
                    servers: store.servers.map { ServerSwitcher.Server(id: $0.id, name: $0.displayName) },
                    activeServerID: store.activeServer?.id,
                    onSwitch: { serverID in Task { await switchServer(serverID) } }
                ),
                onSignOut: { try await store.signOut() }
            )
        } else {
            Color.clear.navigationTitle("You")
        }
    }

    /// Stacked, a hit opens in its own tab. Split, it replaces the
    /// selection beside Search's list and opens scrolled to the match.
    var searchRoot: some View {
        let origin: RouteOrigin = router.layout == .split ? .inside : .outside
        return SearchTabView(
            chats: store.chatDestinations.compactMap(\.durableChat),
            searchMessages: { query, chatID in try await store.searchMessagePresentations(query: query, chatID: chatID) },
            searchRecoveryRevision: store.messageSearchRevision,
            isTabRoot: true,
            palette: store.searchPaletteContent,
            actions: SearchPaletteActions(
                onSelectCaptain: { router.open(.captain(agentID: $0), from: origin) },
                onSelectTask: { router.open(.task(taskID: $0), from: origin) },
                onOpenPeople: { router.open(.settings(.people), from: .outside) },
                onNewTask: { router.present(.askAnything) },
                onNewProject: { router.present(.newProject) },
                onGoToTasks: { router.selectedTab = .tasks },
                onGoToSettings: { router.selectedTab = .you },
                onClose: { router.closeSearch() },
                onAppear: { await store.loadSearchPalette() }
            ),
            selection: searchSelection,
            onSelectChat: { router.open(route(forChatID: $0.id), from: origin) },
            onSelectMessage: { router.open(route(forChatID: $0.chatID, messageID: $0.id), from: origin) }
        )
    }

    /// The conversation selected beside a split tab's list.
    private func selectedConversation(_ tab: HausTab) -> HausConversation? {
        guard case let .split(selection?, _, _) = router.panes(tab) else { return nil }
        return selection.conversation
    }

    private var selectedProjectsChatID: String? {
        if case .chat(let chatID)? = selectedConversation(.projects) { chatID } else { nil }
    }

    private var selectedTaskID: String? {
        if case .task(let taskID)? = selectedConversation(.tasks) { taskID } else { nil }
    }

    private var searchSelection: SearchSelection? {
        guard case let .split(selection?, _, _) = router.panes(.search) else { return nil }
        if let reveal = selection.revealedMessage { return .message(reveal.messageID) }
        switch selection.conversation {
        case .chat(let chatID)?: return .chat(chatID)
        case .captain(let agentID)?: return .captain(agentID)
        case .task(let taskID)?: return .task(taskID)
        case nil: return nil
        }
    }

    /// A fresh Server's next steps. Blank until the Chat list and, for
    /// someone who can add Captains, the Devices have loaded.
    var firstRun: FirstRunPresentation? {
        guard store.hasLoadedChats, !store.canManageServer || store.computers != nil else { return nil }
        let projects = store.chats.filter { $0.kind == .channel && !$0.isAll }
        guard let copy = FirstRunCopy.needed(
            projectCount: projects.count,
            captainCount: store.agents.count,
            deviceCount: store.computers?.count,
            canManage: store.canManageServer
        ) else { return nil }
        return FirstRunPresentation(
            title: copy.title,
            description: copy.description,
            steps: copy.actions.map { action in
                switch action {
                case .connectDevice:
                    .init(title: "Connect a Device") { router.open(.settings(.computers), from: .outside) }
                case .newProject:
                    .init(title: "New project") { router.present(.newProject) }
                case .newCaptain:
                    .init(title: "New Captain") { router.present(.newCaptain) }
                }
            }
        )
    }

    private var settingsPath: Binding<[SettingsRoute]> {
        Binding(
            get: { YouStack.settings(in: router.path(.you)) },
            set: { router.setPath(YouStack.path(router.path(.you), writing: $0), for: .you) }
        )
    }
}
