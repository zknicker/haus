import Foundation
import HausModels

/// Server-backed profile mutations owned by the app/client layer. Settings views
/// receive narrow seams and canonical Server values; avatar payloads are already validated.
public struct SettingsPersistence: Sendable {
    public let generateAgentAvatar: @Sendable (String, String) async throws -> AvatarImagePayload
    public let saveHumanProfile: @Sendable (String, String, String?, String) async throws -> SettingsPerson
    public let saveAgentProfile: @Sendable (String, String, String) async throws -> SettingsAgent
    public let saveAgentRuntime: @Sendable (String, AgentRuntimeConfiguration) async throws -> SettingsAgent
    public let saveHumanAvatar: @Sendable (String, AvatarImagePayload) async throws -> SettingsPerson
    public let saveAgentAvatar: @Sendable (String, AvatarImagePayload) async throws -> SettingsAgent
    /// `member.setTimezone` for the viewer, answering with the refreshed viewer.
    public let saveHumanTimezone: @Sendable (String, String) async throws -> SettingsPerson

    public init(
        generateAgentAvatar: @escaping @Sendable (String, String) async throws -> AvatarImagePayload,
        saveHumanProfile: @escaping @Sendable (String, String, String?, String) async throws -> SettingsPerson,
        saveAgentProfile: @escaping @Sendable (String, String, String) async throws -> SettingsAgent,
        saveAgentRuntime: @escaping @Sendable (String, AgentRuntimeConfiguration) async throws -> SettingsAgent,
        saveHumanAvatar: @escaping @Sendable (String, AvatarImagePayload) async throws -> SettingsPerson,
        saveAgentAvatar: @escaping @Sendable (String, AvatarImagePayload) async throws -> SettingsAgent,
        saveHumanTimezone: @escaping @Sendable (String, String) async throws -> SettingsPerson
    ) {
        self.generateAgentAvatar = generateAgentAvatar
        self.saveHumanProfile = saveHumanProfile
        self.saveAgentProfile = saveAgentProfile
        self.saveAgentRuntime = saveAgentRuntime
        self.saveHumanAvatar = saveHumanAvatar
        self.saveAgentAvatar = saveAgentAvatar
        self.saveHumanTimezone = saveHumanTimezone
    }

    public static let preview = SettingsPersistence(
        generateAgentAvatar: { _, _ in
            throw CancellationError()
        },
        saveHumanProfile: { id, displayName, handle, description in
            let person = SettingsFixtures.viewer
            return SettingsPerson(
                id: id,
                displayName: displayName,
                handle: handle,
                email: person.email,
                role: person.role,
                joined: person.joined,
                description: description,
                avatarURL: person.avatarURL,
                initials: person.initials
            )
        },
        saveAgentProfile: { id, displayName, description in
            let agent = SettingsFixtures.cove
            return SettingsAgent(
                id: id,
                displayName: displayName,
                handle: agent.handle,
                description: description,
                runtime: agent.runtime,
                model: agent.model,
                status: agent.status,
                avatarURL: agent.avatarURL,
                presence: agent.presence,
                initials: agent.initials,
                canGenerateAvatar: agent.canGenerateAvatar
            )
        },
        saveAgentRuntime: { _, _ in SettingsFixtures.cove },
        saveHumanAvatar: { _, _ in
            SettingsFixtures.viewer
        },
        saveAgentAvatar: { _, _ in
            SettingsFixtures.cove
        },
        saveHumanTimezone: { _, timezone in
            let person = SettingsFixtures.viewer
            return SettingsPerson(
                id: person.id,
                displayName: person.displayName,
                handle: person.handle,
                email: person.email,
                role: person.role,
                joined: person.joined,
                description: person.description,
                avatarURL: person.avatarURL,
                initials: person.initials,
                timezone: timezone
            )
        }
    )
}
