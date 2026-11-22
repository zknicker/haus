import HausModels
import SwiftUI

/// The screens the hub's rows push.
extension SettingsSheet {
    @ViewBuilder
    func hubDestination(for route: SettingsRoute) -> some View {
        switch route {
        case .automations:
            if canManageServer {
                AutomationsIndexView(agents: data.agents, actions: automations) { agentID in
                    path.append(.agentAutomations(id: agentID))
                }
            } else {
                SettingsUnavailableView(title: "Automations")
            }
        case .drive(let prefix):
            SettingsDriveView(
                prefix: prefix,
                load: server.loadDrive,
                onOpenFolder: { path.append(.drive(prefix: $0.path)) },
                onOpenFile: { server.openDriveFile($0) }
            )
        case .general:
            GeneralSettingsView()
        case .notifications:
            NotificationsSettingsView(setting: notifications)
        case .captains:
            CaptainsSettingsView(agents: data.agents) { path.append(.agent(id: $0)) }
        case .models:
            ModelsConnectionsView(
                connections: server.modelConnections,
                onOpenUsage: { path.append(.modelUsage) },
                onOpenCloudAgents: { path.append(.cloudAgents) }
            )
        case .modelUsage:
            ModelConnectionsUsageView(connections: server.modelConnections ?? [])
        case .projects:
            ProjectsSettingsView(projects: server.projects, reload: server.reloadProjects) {
                path.append(.project(id: $0))
            }
        case .project(let id):
            if let project = server.projects?.first(where: { $0.id == id }) {
                ProjectSettingsDetailView(project: project)
            } else {
                SettingsUnavailableView(title: "Project")
            }
        case .server:
            ServerDetailsView(server: data.server)
        case .people:
            ServerPeopleView(members: data.members)
        case .computers:
            ServerComputersView(computers: data.computers, setWorkers: server.setWorkers)
        case .cloudAgents:
            WorkerSettingsView(
                computers: data.computers,
                canManage: canManageServer,
                actions: cloudAgentActions
            )
        case .appInfo:
            AppInfoView()
        case .profile, .agent, .agentRuntime, .agentAutomations, .description:
            SettingsUnavailableView(title: "Settings")
        }
    }
}
