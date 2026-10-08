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
                },
                onSaveTimezone: { timezone in
                    let saved = try await persistence.saveHumanTimezone(data.viewer.id, timezone)
                    updateViewer(saved)
                    return saved
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
                        openAvatarGenerator(for: agent)
                    },
                    onOpenRuntimeConfiguration: {
                        path.append(.agentRuntime(id: agent.id))
                    },
                    // Reminders and Triggers are readable by Owners and Admins only.
                    onOpenAutomations: canManageServer ? { path.append(.agentAutomations(id: agent.id)) } : nil
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
        case .agentAutomations(let id):
            if let agent = data.agents.first(where: { $0.id == id }), canManageServer {
                AgentAutomationsView(
                    agentID: agent.id,
                    agentName: agent.displayName,
                    actions: automations,
                    onOpenChat: { chatID in
                        automations.openChat(chatID)
                        dismiss()
                    }
                )
            } else {
                SettingsUnavailableView(title: "Automations")
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
                canManage: canManageServer,
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

    var canManageServer: Bool {
        ["owner", "admin"].contains(data.server.role.lowercased())
    }
}
