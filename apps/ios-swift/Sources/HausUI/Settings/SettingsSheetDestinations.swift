import SwiftUI

extension SettingsSheet {
    @ViewBuilder
    func destination(for route: SettingsRoute) -> some View {
        switch route {
        case .profile:
            HumanProfileView(
                person: data.viewer,
                onEditDescription: { ownerID, title in
                    path.append(.description(ownerID: ownerID, title: title))
                },
                onSave: { updated in
                    let saved = try await persistence.saveHumanProfile(
                        updated.id,
                        updated.displayName,
                        updated.handle,
                        updated.description
                    )
                    updateViewer(saved)
                    return saved
                },
                onSaveAvatar: { payload in
                    let saved = try await persistence.saveHumanAvatar(data.viewer.id, payload)
                    await MainActor.run {
                        updateViewer(saved)
                    }
                }
            )
        case .agent(let id):
            if let agent = data.agents.first(where: { $0.id == id }) {
                AgentProfileView(
                    agent: agent,
                    onEditDescription: { ownerID, title in
                        path.append(.description(ownerID: ownerID, title: title))
                    },
                    onSave: { updated in
                        let saved = try await persistence.saveAgentProfile(
                            updated.id,
                            updated.displayName,
                            updated.description
                        )
                        updateAgent(saved)
                        return saved
                    },
                    onSaveAvatar: { payload in
                        let saved = try await persistence.saveAgentAvatar(agent.id, payload)
                        await MainActor.run {
                            updateAgent(saved)
                        }
                    },
                    onOpenAvatarGenerator: {
                        avatarGenerator = AvatarGeneratorSheet(
                            agentID: agent.id,
                            agentName: agent.displayName
                        )
                    },
                    onOpenRuntimeConfiguration: {
                        path.append(.agentRuntime(id: agent.id))
                    }
                )
            } else {
                SettingsUnavailableView(title: "Agent profile")
            }
        case .agentRuntime(let id):
            if let agent = data.agents.first(where: { $0.id == id }),
               let configuration = agent.runtimeConfiguration,
               configuration.canEdit {
                AgentRuntimeConfigurationView(
                    configuration: configuration,
                    onSave: { draft in
                        let saved = try await persistence.saveAgentRuntime(agent.id, draft)
                        updateAgent(saved)
                        return saved
                    }
                )
            } else {
                SettingsUnavailableView(title: "Runtime configuration")
            }
        case .server:
            ServerDetailsView(server: data.server)
        case .people:
            ServerPeopleView(members: data.members)
        case .computers:
            ServerComputersView(computers: data.computers)
        case .cloudAgents:
            CloudAgentSettingsView(
                computers: data.computers,
                canManage: ["owner", "admin"].contains(data.server.role.lowercased()),
                actions: cloudAgentActions
            )
        case .appInfo:
            AppInfoView()
        case .description(let ownerID, let title):
            DescriptionEditorView(
                title: title,
                value: currentDescription(ownerID: ownerID),
                onSave: { updatedValue in
                    try await saveDescription(ownerID: ownerID, value: updatedValue)
                    path.removeLast()
                }
            )
        }
    }
}
