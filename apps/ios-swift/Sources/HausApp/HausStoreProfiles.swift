import Foundation
import HausModels
import HausTransport
import HausUI

extension HausStore {
    /// Whether the viewer may act on Server-owned records rather than only read
    /// them. The Server is the authority; this is the App's local read of the
    /// same membership role, so a control is not offered where it would be
    /// refused.
    var canManageServer: Bool {
        guard let role = members?.viewerRole else { return false }
        return role == .owner || role == .admin
    }

    /// Refetches the Agent directory. Presence is an overlay on top of it, so a
    /// fresh directory drops the stale overlay rather than merging into it.
    func reloadAgents(serverID: String) async throws {
        let refreshed: [AgentSummary] = try await client.query(
            "agent.list",
            input: ServerScopedInput(serverId: serverID)
        )
        agents = refreshed
        lifecycleAvailability.removeAll()
    }

    func syncHumanIdentity(serverID: String) async throws {
        let user = clerk.user
        let name = [user?.firstName, user?.lastName]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfBlank }
            .joined(separator: " ")
            .nilIfBlank
        let _: TRPCNoContent = try await client.mutation(
            "member.syncIdentity",
            input: SyncHumanIdentityInput(
                email: user?.primaryEmailAddress?.emailAddress,
                name: name,
                serverID: serverID
            )
        )
    }

    func saveHumanProfile(
        userID: String,
        displayName: String,
        handle: String?,
        description: String
    ) async throws -> SettingsPerson {
        guard let serverID = activeServer?.id,
              let directory = members,
              directory.viewerUserID == userID else {
            throw HausStoreError.profileUnavailable
        }
        let _: TRPCNoContent = try await client.mutation(
            "member.updateProfile",
            input: UpdateHumanProfileInput(
                description: description.nilIfBlank,
                displayName: displayName.trimmingCharacters(in: .whitespacesAndNewlines),
                handle: handle?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
                serverID: serverID
            )
        )
        let refreshed: MemberList = try await client.query(
            "member.list",
            input: ServerScopedInput(serverId: serverID)
        )
        members = refreshed
        guard let viewer = settingsData?.viewer else {
            throw HausStoreError.profileUnavailable
        }
        return viewer
    }

    func saveAgentProfile(
        agentID: String,
        displayName: String,
        description: String
    ) async throws -> SettingsAgent {
        guard let serverID = activeServer?.id else {
            throw HausStoreError.profileUnavailable
        }
        let updated: AgentSummary = try await client.mutation(
            "agent.updateProfile",
            input: UpdateAgentProfileInput(
                agentID: agentID,
                description: description.nilIfBlank,
                displayName: displayName.trimmingCharacters(in: .whitespacesAndNewlines),
                serverID: serverID
            )
        )
        agents = agents.map { $0.id == updated.id ? updated : $0 }
        guard let agent = settingsData?.agents.first(where: { $0.id == agentID }) else {
            throw HausStoreError.profileUnavailable
        }
        return agent
    }

    func saveAgentRuntime(
        agentID: String,
        configuration: AgentRuntimeConfiguration
    ) async throws -> SettingsAgent {
        guard let serverID = activeServer?.id else {
            throw HausStoreError.profileUnavailable
        }
        let updated: AgentSummary = try await client.mutation(
            "agent.configure",
            input: ConfigureAgentInput(
                agentID: agentID,
                modelID: configuration.modelID,
                reasoningEffort: configuration.reasoningEffort,
                runtimeID: configuration.runtimeID,
                serverID: serverID
            )
        )
        agents = agents.map { $0.id == updated.id ? updated : $0 }
        guard let agent = settingsData?.agents.first(where: { $0.id == agentID }) else {
            throw HausStoreError.profileUnavailable
        }
        return agent
    }

    func saveHumanAvatar(
        userID: String,
        payload: AvatarImagePayload
    ) async throws -> SettingsPerson {
        guard let serverID = activeServer?.id,
              let directory = members,
              directory.viewerUserID == userID else {
            throw HausStoreError.profileUnavailable
        }
        let _: Avatar = try await client.mutation(
            "avatar.set",
            input: SetAvatarInput(
                bytesBase64: payload.data.base64EncodedString(),
                mediaType: transportMediaType(for: payload.mediaType),
                serverID: serverID,
                target: .user
            )
        )
        let refreshed: MemberList = try await client.query(
            "member.list",
            input: ServerScopedInput(serverId: serverID)
        )
        members = refreshed
        guard let viewer = settingsData?.viewer else {
            throw HausStoreError.profileUnavailable
        }
        return viewer
    }

    func saveAgentAvatar(
        agentID: String,
        payload: AvatarImagePayload
    ) async throws -> SettingsAgent {
        guard let serverID = activeServer?.id,
              agents.contains(where: { $0.id == agentID }) else {
            throw HausStoreError.profileUnavailable
        }
        do {
            let _: Avatar = try await client.mutation(
                "avatar.set",
                input: SetAvatarInput(
                    bytesBase64: payload.data.base64EncodedString(),
                    mediaType: transportMediaType(for: payload.mediaType),
                    serverID: serverID,
                    target: .agent(agentID: agentID)
                )
            )
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw AvatarGenerationFailure.from(error)
        }
        let refreshed: [AgentSummary] = try await client.query(
            "agent.list",
            input: ServerScopedInput(serverId: serverID)
        )
        agents = refreshed
        guard let agent = settingsData?.agents.first(where: { $0.id == agentID }) else {
            throw HausStoreError.profileUnavailable
        }
        return agent
    }

    func generateAgentAvatar(agentID: String, concept: String) async throws -> AvatarImagePayload {
        guard let serverID = activeServer?.id,
              agents.contains(where: { $0.id == agentID }) else {
            throw HausStoreError.profileUnavailable
        }
        let response: GenerateAgentAvatarResponse
        do {
            response = try await client.mutation(
                "avatar.generate",
                input: GenerateAgentAvatarInput(
                    agentID: agentID,
                    concept: concept,
                    serverID: serverID
                ),
                timeout: avatarGenerationTimeout
            )
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw AvatarGenerationFailure.from(error)
        }
        let avatar = response.avatar
        guard avatar.width == AvatarImageConstraints.pixelSize,
              avatar.height == AvatarImageConstraints.pixelSize,
              avatar.mediaType == .png,
              let data = Data(base64Encoded: avatar.bytesBase64),
              !data.isEmpty,
              data.count == avatar.byteSize,
              AvatarImageConstraints.fits(byteCount: data.count) else {
            throw HausStoreError.invalidGeneratedAvatar
        }
        return AvatarImagePayload(
            data: data,
            mediaType: .png
        )
    }

    /// One drawing takes the image provider tens of seconds, and the Server
    /// waits up to a minute on it, so this outlives `URLSession`'s 60-second
    /// default rather than abandoning a request the Server is still answering.
    private var avatarGenerationTimeout: TimeInterval { 180 }

    private func transportMediaType(for mediaType: AvatarImageMediaType) -> AvatarMediaType {
        switch mediaType {
        case .jpeg:
            .jpeg
        case .png:
            .png
        }
    }

}
