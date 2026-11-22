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
            workers: store.activeWorkers,
            recent: store.homeRecentRows,
            openTasks: store.homeOpenTaskRows,
            tileActions: captainTileActions,
            onOpen: openHomeRow,
            onOpenWorker: { openActiveWorker(workID: $0.id) },
            onMarkRead: { chatID in Task { await store.markInboxRowRead(id: chatID) } },
            onRefresh: refreshHome,
            onNewCaptain: store.canManageServer ? { router.present(.newCaptain) } : nil
        )
    }

    var projectsRoot: some View {
        ProjectsTabView(
            projects: store.projectRows,
            people: store.personRows,
            captains: store.agents.map(store.captainIdentity),
            archivedCount: store.projects.archivedCount,
            isLoaded: store.hasLoadedChats,
            actions: projectsTabActions
        )
    }

    var tasksRoot: some View {
        TaskBoardScreen(
            store: store,
            filter: Binding(
                get: {
                    var filter = taskBoardFilter
                    if router.tasksFilter == .assignedToMe { filter.scope = .assignedToMe }
                    return filter
                },
                set: { filter in
                    taskBoardFilter = filter
                    router.tasksFilter = filter.scope == .assignedToMe ? .assignedToMe : .following
                }
            ),
            onOpenTask: { router.open(.task(taskID: $0, messageID: nil)) }
        )
    }

    /// Settings and the Drive it browses, on one stack: the hub pushes its
    /// own screens, and Drive opens through the router.
    var youStack: some View {
        NavigationStack(path: youPath) {
            youRoot(settingsPath)
                .navigationDestination(for: HausRoute.self) { routeDestination($0) }
        }
    }

    @ViewBuilder
    private func youRoot(_ path: Binding<[SettingsRoute]>) -> some View {
        if let data = store.settingsData {
            SettingsSheet(
                tabPath: path,
                data: data,
                persistence: store.settingsPersistence,
                cloudAgentActions: store.cloudAgentSettings,
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

    var searchRoot: some View {
        SearchTabView(
            chats: store.chatDestinations.compactMap(\.durableChat),
            searchMessages: { query, chatID in try await store.searchMessagePresentations(query: query, chatID: chatID) },
            searchRecoveryRevision: store.messageSearchRevision,
            isTabRoot: true,
            palette: store.searchPaletteContent,
            actions: SearchPaletteActions(
                onSelectCaptain: { router.open(.captainDM(agentID: $0), from: .outside) },
                onSelectTask: { router.open(.task(taskID: $0), from: .outside) },
                onOpenPeople: { router.open(.settings(.people), from: .outside) },
                onNewTask: { router.present(.askAnything) },
                onNewProject: { router.present(.newProject) },
                onGoToTasks: { router.selectedTab = .tasks },
                onGoToSettings: { router.selectedTab = .you },
                onClose: { router.closeSearch() },
                onAppear: { await store.loadSearchPalette() }
            ),
            onSelectChat: { router.open(route(forChatID: $0.id), from: .outside) },
            onSelectMessage: { router.open(route(forChatID: $0.chatID, messageID: $0.id), from: .outside) }
        )
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

    /// You's stack as its `NavigationStack` holds it: settings screens as
    /// themselves, so the hub's destinations draw them, and Drive as routes.
    /// Only back and interactive pop write it, so a write keeps a prefix.
    private var youPath: Binding<NavigationPath> {
        Binding(
            get: {
                router.path(.you).reduce(into: NavigationPath()) { navigation, route in
                    if case .settings(let settings) = route { navigation.append(settings) } else { navigation.append(route) }
                }
            },
            set: { router.setPath(Array(router.path(.you).prefix($0.count)), for: .you) }
        )
    }
}
