import HausAppModel
import HausModels
import HausUI
import OSLog
import SwiftUI

/// What Home's and Projects' rows do, and the Project settings route.
extension AuthenticatedHausView {
    var captainTileActions: CaptainTileActions {
        CaptainTileActions(
            open: { router.open(.captainDM(agentID: $0.id)) },
            openProfile: { router.open(.settings(.agent(id: $0.id)), from: .outside) },
            openAutomations: { router.open(.settings(.agentAutomations(id: $0.id)), from: .outside) }
        )
    }

    func openHomeRow(_ target: HomeRowTarget) {
        switch target {
        case .captain(let agentID): router.open(.captainDM(agentID: agentID))
        case .chat(let chatID): router.open(route(forChatID: chatID))
        case .task(let taskID): router.open(.task(taskID: taskID))
        }
    }

    /// The Inbox's reads (Chats, unread Task chats, active Workers) plus the
    /// open Tasks.
    func refreshHome() async {
        async let inbox: Void = store.loadInbox()
        async let open: Void = loadOpenTasks()
        _ = await (inbox, open)
    }

    private func loadOpenTasks() async {
        do {
            try await store.tasks.reloadOpenTasks()
        } catch {
            HausStore.logger.error("Loading open Tasks failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    var projectsTabActions: ProjectsTabActions {
        ProjectsTabActions(
            open: { router.open(route(forChatID: $0)) },
            markRead: { chatID in Task { await store.markChatRead(chatID: chatID) } },
            openDetails: { router.present(.chatDetails(.chat($0))) },
            openSettings: { router.open(.projectSettings(projectID: $0)) },
            openArchived: { router.present(.archivedProjects) },
            newProject: { router.present(.newProject) },
            refresh: refreshProjects
        )
    }

    func refreshProjects() async {
        async let inbox: Void = store.loadInbox()
        async let projects: Void = store.projects.load()
        async let open: Void = loadOpenTasks()
        _ = await (inbox, projects, open)
    }

    func projectSettingsDestination(_ projectID: String) -> some View {
        let projects = store.projects
        return ProjectSettingsView(
            project: projects.project(id: projectID),
            devices: (store.computers ?? []).map { ProjectSettingsDevice(id: $0.id, name: $0.name ?? "Device") },
            actions: ProjectSettingsActions(
                save: { name, key in
                    try await projects.update(chatID: projectID, name: name, key: key)
                    await store.loadInbox()
                },
                addRepo: { try await projects.addRepo(projectID: projectID, repository: $0) },
                removeRepo: { try await projects.removeRepo(projectRepoID: $0) },
                linkRepo: { try await projects.linkRepo(projectRepoID: $0, computerID: $1, checkoutPath: nil) },
                unlinkRepo: { try await projects.unlinkRepo(projectRepoID: $0, computerID: $1) },
                setDefaultPlace: { try await projects.setDefaultWorkerPlace(projectID: projectID, place: $0) }
            )
        )
        .task {
            await projects.load()
            if let serverID = store.activeServer?.id, store.computers == nil {
                await store.loadComputers(serverID: serverID)
            }
        }
    }
}
