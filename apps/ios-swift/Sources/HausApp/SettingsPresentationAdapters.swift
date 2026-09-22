import Foundation
import HausModels
import HausUI

extension HausStore {
    var settingsPersistence: SettingsPersistence {
        SettingsPersistence(
            generateAgentAvatar: { [weak self] agentID, concept in
                guard let self else { throw CancellationError() }
                return try await self.generateAgentAvatar(agentID: agentID, concept: concept)
            },
            saveHumanProfile: { [weak self] userID, displayName, handle, description in
                guard let self else { throw CancellationError() }
                return try await self.saveHumanProfile(
                    userID: userID,
                    displayName: displayName,
                    handle: handle,
                    description: description
                )
            },
            saveAgentProfile: { [weak self] agentID, displayName, description in
                guard let self else { throw CancellationError() }
                return try await self.saveAgentProfile(
                    agentID: agentID,
                    displayName: displayName,
                    description: description
                )
            },
            saveAgentRuntime: { [weak self] agentID, configuration in
                guard let self else { throw CancellationError() }
                return try await self.saveAgentRuntime(
                    agentID: agentID,
                    configuration: configuration
                )
            },
            saveHumanAvatar: { [weak self] userID, payload in
                guard let self else { throw CancellationError() }
                return try await self.saveHumanAvatar(userID: userID, payload: payload)
            },
            saveAgentAvatar: { [weak self] agentID, payload in
                guard let self else { throw CancellationError() }
                return try await self.saveAgentAvatar(agentID: agentID, payload: payload)
            }
        )
    }

    var settingsTasksPersistence: TaskListPersistence {
        // Snapshot the directories through the same actor projection the Thread
        // task drawer uses, so a task row and its drawer show one name and one
        // avatar. Resolution happens here because the seam closure is
        // synchronous and cannot reach back into the store.
        let agentAssignees = Dictionary(
            agents.compactMap { agent in
                actorPresentation(agentID: agent.id, userID: nil).map { (agent.id, $0) }
            },
            uniquingKeysWith: { current, _ in current }
        )
        let memberAssignees = Dictionary(
            (members?.members ?? []).compactMap { member in
                actorPresentation(agentID: nil, userID: member.userID).map { (member.userID, $0) }
            },
            uniquingKeysWith: { current, _ in current }
        )
        return TaskListPersistence(
            viewerUserID: settingsData?.viewer.id,
            assignee: { item in
                if let agentID = item.task.assigneeAgentID {
                    return agentAssignees[agentID]
                }
                if let userID = item.task.assigneeUserID {
                    return memberAssignees[userID]
                }
                return nil
            },
            // The default lens is the Server-wide read the Store already
            // owns, so the screen reads that one snapshot and a durable task
            // event keeps it current. Only the widened lens is the screen's.
            tasks: { [weak self] in self?.inboxTasks },
            backgroundCount: { [weak self] in self?.taskBackgroundCount ?? 0 },
            load: { [weak self] includeBackground in
                guard let self else { throw CancellationError() }
                return try await self.reloadTaskLens(includeBackground: includeBackground)
            },
            updateStatus: { [weak self] item, status in
                guard let self else { throw CancellationError() }
                _ = try await self.updateTaskStatus(item.task, status: status)
            },
            claim: { [weak self] item in
                guard let self else { throw CancellationError() }
                _ = try await self.claimTask(item.task)
            },
            unclaim: { [weak self] item in
                guard let self else { throw CancellationError() }
                _ = try await self.unclaimTask(item.task)
            }
        )
    }

    var settingsData: SettingsData? {
        guard let server = activeServer, let directory = members else { return nil }
        let people = directory.members.map { member in
            SettingsPerson(
                id: member.userID,
                displayName: member.displayName ?? member.email ?? member.handle ?? "Haus member",
                handle: member.handle,
                email: member.email,
                role: member.role.rawValue.capitalized,
                joined: member.joinedAt.formatted(date: .abbreviated, time: .omitted),
                description: member.description ?? "",
                avatarURL: resolvedAvatarURL(member.avatarURL)
            )
        }
        guard let viewer = people.first(where: { $0.id == directory.viewerUserID }) else { return nil }
        let computersByID = Dictionary(
            (computers ?? []).map { ($0.id, $0) },
            uniquingKeysWith: { current, _ in current }
        )

        return SettingsData(
            server: SettingsServer(
                id: server.id,
                name: server.displayName,
                slug: server.slug,
                role: server.role.rawValue.capitalized,
                memberCount: directory.members.count,
                agentCount: agents.count
            ),
            viewer: viewer,
            members: people,
            agents: agents.map { agent in
                let computer = computersByID[agent.computerID]
                let desiredConfiguration = AgentRuntimeConfiguration(
                    modelID: agent.desiredModelID,
                    reasoningEffort: agent.desiredReasoningEffort ?? .medium,
                    runtimeID: agent.desiredRuntimeID
                )
                let effectiveConfiguration: AgentRuntimeConfiguration? = if let modelID = agent.effectiveModelID,
                                                                              let reasoningEffort = agent.effectiveReasoningEffort,
                                                                              let runtimeID = agent.effectiveRuntimeID {
                    AgentRuntimeConfiguration(
                        modelID: modelID,
                        reasoningEffort: reasoningEffort,
                        runtimeID: runtimeID
                    )
                } else {
                    nil
                }
                let runtimeConfiguration = SettingsAgentRuntimeConfiguration(
                    desired: desiredConfiguration,
                    effective: effectiveConfiguration,
                    runtimes: computer?.reportedInventory?.runtimes.map(SettingsRuntime.init) ?? [],
                    computerHealth: computer?.health,
                    status: agent.status,
                    canEdit: canManageServer
                )
                return SettingsAgent(
                    id: agent.id,
                    displayName: agent.displayName,
                    handle: agent.handle,
                    description: agent.description ?? "",
                    runtime: settingsRuntimeDisplayName(agent.effectiveRuntimeID ?? agent.desiredRuntimeID),
                    model: agent.effectiveModelID ?? agent.desiredModelID,
                    status: availability(for: agent).rawValue.capitalized,
                    avatarURL: resolvedAvatarURL(agent.avatarURL),
                    presence: settingsPresence(availability(for: agent)),
                    canGenerateAvatar: agent.factoryKind == .ordinary,
                    runtimeConfiguration: runtimeConfiguration
                )
            },
            computers: computers?.map(computerPresentation)
        )
    }

    private func computerPresentation(_ computer: ComputerSummary) -> SettingsComputer {
        SettingsComputer(
            id: computer.id,
            name: computerLabel(computer),
            health: computerHealthLabel(computer.health),
            isHealthy: computer.health == .healthy,
            system: computerSystemLabel(computer),
            version: "v\(computer.productVersion ?? "—")"
        )
    }

    private func computerLabel(_ computer: ComputerSummary) -> String {
        if let name = computer.name?.nilIfBlank { return name }
        return "\(operatingSystemLabel(computer.operatingSystem) ?? "") Computer"
            .trimmingCharacters(in: .whitespaces)
    }

    private func computerSystemLabel(_ computer: ComputerSummary) -> String {
        let labels = [
            operatingSystemLabel(computer.operatingSystem),
            architectureLabel(computer.architecture),
        ].compactMap { $0 }
        return labels.isEmpty ? "Awaiting first report" : labels.joined(separator: " · ")
    }

    private func computerHealthLabel(_ health: ComputerHealth) -> String {
        switch health {
        case .healthy: "Online"
        case .offline: "Offline"
        case .updateRequired: "Update required"
        case .degraded: "Needs attention"
        }
    }

    private func operatingSystemLabel(_ value: String?) -> String? {
        switch value?.lowercased() {
        case "darwin": "Mac"
        case "linux": "Linux"
        case "win32", "windows": "Windows"
        default: value
        }
    }

    private func architectureLabel(_ value: String?) -> String? {
        switch value?.lowercased() {
        case "arm64": "Apple Silicon"
        case "x64", "x86_64": "Intel"
        default: value
        }
    }

    private func settingsPresence(_ availability: AgentAvailability) -> AgentPresence {
        switch availability {
        case .idle: .idle
        case .working: .working
        case .error: .error
        case .offline: .offline
        case .stopped: .stopped
        }
    }
}
