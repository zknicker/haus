import HausAppModel
import HausModels
import HausUI
import OSLog
import SwiftUI

/// What Home's and Projects' rows do, and the Project settings route.
extension AuthenticatedHausView {
    var captainTileActions: CaptainTileActions {
        CaptainTileActions(
            open: { router.open(.captain(agentID: $0.id)) },
            openProfile: { router.open(.settings(.agent(id: $0.id)), from: .outside) },
            openAutomations: { router.open(.settings(.agentAutomations(id: $0.id)), from: .outside) }
        )
    }

    func openHomeRow(_ target: HomeRowTarget) {
        switch target {
        case .captain(let agentID): router.open(.captain(agentID: agentID))
        case .chat(let chatID): router.open(route(forChatID: chatID))
        case .task(let taskID): router.open(.task(taskID: taskID))
        }
    }

    /// The Inbox's reads: Chats, unread Task chats, and the active Tasks.
    func refreshHome() async {
        await store.loadInbox()
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
        _ = await (inbox, projects)
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
                setDefaultMachine: { try await projects.setDefaultMachine(projectID: projectID, computerID: $0) }
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
