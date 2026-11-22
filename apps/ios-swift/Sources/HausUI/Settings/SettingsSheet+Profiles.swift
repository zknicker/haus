import HausModels
import SwiftUI

/// Settings' own copy of the viewer and Captains, updated from each save so a
/// pushed screen shows the Server's answer before the next directory read.
extension SettingsSheet {
    func openAvatarGenerator(for agent: SettingsAgent) {
        let session = avatarSessions[agent.id] ?? AvatarGenerationSession()
        avatarSessions[agent.id] = session
        session.opened()
        avatarGenerator = AvatarGeneratorSheet(
            agentID: agent.id,
            agentName: agent.displayName,
            avatarURL: agent.avatarURL,
            initials: agent.initials,
            session: session
        )
    }

    func updateViewer(_ viewer: SettingsPerson) {
        data = SettingsData(
            server: data.server,
            viewer: viewer,
            members: data.members.map { $0.id == viewer.id ? viewer : $0 },
            agents: data.agents,
            computers: data.computers
        )
    }

    func updateAgent(_ agent: SettingsAgent) {
        let agents = data.agents.map { $0.id == agent.id ? agent : $0 }
        data = SettingsData(
            server: data.server,
            viewer: data.viewer,
            members: data.members,
            agents: agents,
            computers: data.computers
        )
    }

    /// Reads the description live from `data` rather than a route-carried
    /// snapshot, so the editor always opens with the latest saved value.
    func currentDescription(ownerID: String) -> String {
        if data.viewer.id == ownerID {
            return data.viewer.description
        }
        return data.agents.first(where: { $0.id == ownerID })?.description ?? ""
    }

    func saveDescription(ownerID: String, value: String) async throws {
        if data.viewer.id == ownerID {
            let viewer = data.viewer
            let saved = try await persistence.saveHumanProfile(
                viewer.id,
                viewer.displayName,
                viewer.handle,
                value
            )
            updateViewer(saved)
            return
        }

        guard let agent = data.agents.first(where: { $0.id == ownerID }) else { return }
        let saved = try await persistence.saveAgentProfile(
            agent.id,
            agent.displayName,
            value
        )
        updateAgent(saved)
    }
}

struct AvatarGeneratorSheet: Identifiable {
    let agentID: String
    let agentName: String
    let avatarURL: URL?
    let initials: String
    let session: AvatarGenerationSession

    var id: String { agentID }
}
