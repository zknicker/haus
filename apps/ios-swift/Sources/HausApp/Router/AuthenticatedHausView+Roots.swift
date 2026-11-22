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
            greetingName: store.inboxGreetingName,
            agentWeeks: store.inboxAgentWeeks(),
            unread: store.inboxUnreadRows,
            cloudAgentWork: store.activeWorkers,
            workingAgents: store.inboxWorkingAgents,
            resolveActor: { agentID, userID in store.actorPresentation(agentID: agentID, userID: userID) },
            firstRun: firstRun,
            onOpen: openInboxRequest,
            onMarkRead: { rowID in Task { await store.markInboxRowRead(id: rowID) } },
            onRefresh: { await store.loadInbox() },
            onNewTask: { router.present(.askAnything) }
        )
    }

    var projectsRoot: some View {
        ProjectsTabView(
            destinations: store.chatDestinations,
            isLoaded: store.hasLoadedChats,
            onOpen: { router.open(route(for: $0)) },
            onMarkRead: { chat in Task { await store.markChatRead(chatID: chat.id) } },
            onOpenDetails: { router.present(.chatDetails(conversation(for: $0))) },
            onOpenArchived: { router.present(.archivedProjects) },
            onNewProject: { router.present(.newProject) }
        )
    }

    var tasksRoot: some View {
        TasksTabView(
            unreadTasks: store.inboxUnreadRows?.filter { if case .task = $0.open { true } else { false } },
            assigned: store.tasks.list?.filter == assignedToMe ? store.tasks.list?.tasks : nil,
            isAssignedToMe: Binding(
                get: { router.tasksFilter == .assignedToMe },
                set: { router.tasksFilter = $0 ? .assignedToMe : .following }
            ),
            onOpen: openInboxRequest,
            onMarkRead: { rowID in Task { await store.markInboxRowRead(id: rowID) } },
            onRefresh: refreshTasks
        )
    }

    @ViewBuilder
    var youStack: some View {
        let path = settingsPath
        NavigationStack(path: path) {
            if let data = store.settingsData {
                SettingsSheet(
                    tabPath: path,
                    data: data,
                    persistence: store.settingsPersistence,
                    cloudAgentActions: store.cloudAgentSettings,
                    automations: store.agentAutomations { router.open(route(forChatID: $0), from: .outside) },
                    stoppedClaims: store.agentStoppedClaims { openClaim($0) },
                    notifications: push.setting,
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
    }

    var searchRoot: some View {
        SearchTabView(
            chats: store.chatDestinations.compactMap(\.durableChat),
            searchMessages: { query, chatID in try await store.searchMessagePresentations(query: query, chatID: chatID) },
            searchRecoveryRevision: store.messageSearchRevision,
            isTabRoot: true,
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

    private var assignedToMe: TaskListFilter {
        TaskListFilter(assignee: .user(store.viewer.id), states: [.todo, .open])
    }

    private var settingsPath: Binding<[SettingsRoute]> {
        Binding(
            get: { router.path(.you).compactMap { if case .settings(let route) = $0 { route } else { nil } } },
            set: { router.setPath($0.map(HausRoute.settings), for: .you) }
        )
    }

    private func refreshTasks() async {
        guard router.tasksFilter == .assignedToMe else {
            await store.loadUnreadTasks()
            return
        }
        do {
            try await store.tasks.showList(assignedToMe)
        } catch {
            HausStore.logger.error("Loading assigned Tasks failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}
