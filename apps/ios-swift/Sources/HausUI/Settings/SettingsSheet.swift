import SwiftUI
import HausModels

public enum SettingsRoute: Hashable {
    case profile
    case agent(id: String)
    case agentRuntime(id: String)
    case server
    case people
    case computers
    case cloudAgents
    case appInfo
    case description(ownerID: String, title: String)
}

public enum AppearancePreference: String, CaseIterable, Hashable, Sendable {
    case system
    case light
    case dark

    public var title: String {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }

    /// The scheme to force, or `nil` to follow the system.
    public var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}

public struct SettingsSheet: View {
    @Environment(\.dismiss) private var dismiss
    let persistence: SettingsPersistence
    let cloudAgentActions: CloudAgentSettingsActions
    @State var data: SettingsData
    @State var path: [SettingsRoute]
    @State var avatarGenerator: AvatarGeneratorSheet?
    @Binding private var appearance: AppearancePreference

    /// - Parameter initialPath: screens the sheet opens already pushed to, so a
    ///   deep link such as the sidebar's Server header lands on its screen with
    ///   the hub still behind it.
    public init(
        data: SettingsData = SettingsFixtures.data,
        persistence: SettingsPersistence = .preview,
        cloudAgentActions: CloudAgentSettingsActions = .unavailable,
        appearance: Binding<AppearancePreference> = .constant(.system),
        initialPath: [SettingsRoute] = []
    ) {
        self.persistence = persistence
        self.cloudAgentActions = cloudAgentActions
        _data = State(initialValue: data)
        _path = State(initialValue: initialPath)
        _appearance = appearance
    }

    public var body: some View {
        NavigationStack(path: $path) {
            // The hub carries the same system navigation bar its pushed screens
            // do. It must not hide the bar and draw a `ChromeHeader` instead:
            // inside a sheet, a hidden-to-visible bar toggle lays the pushed
            // screen out against the pre-push top safe area, so it drew one
            // grabber-height too high for the whole transition and dropped into
            // place a frame after it ended.
            SettingsHubView(
                data: data,
                appearance: $appearance,
                onNavigate: { path.append($0) }
            )
            .navigationTitle("Settings")
            .hausInlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .automatic) {
                    Button { dismiss() } label: {
                        HausIcon(.close, size: 19, weight: GlassChromeButton.iconGlyphWeight)
                    }
                    // The sheet's blue tint belongs to its rows and pickers.
                    // This control is chrome and reads in label colour, like
                    // the back chevron a pushed screen puts on the same rail.
                    .foregroundStyle(HausPlatformColor.label)
                    .accessibilityLabel("Close settings")
                }
            }
            .navigationDestination(for: SettingsRoute.self) { route in
                destination(for: route)
            }
        }
        .tint(.blue)
        // The Appearance picker lives in this sheet, so the sheet has to honor
        // the choice immediately; a presented sheet does not pick up a scheme
        // change made behind it.
        .preferredColorScheme(appearance.colorScheme)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HausPlatformColor.groupedBackground)
        .sheet(item: $avatarGenerator) { generator in
            AgentAvatarGenerationView(
                agentName: generator.agentName,
                onGenerate: { concept in
                    try await persistence.generateAgentAvatar(generator.agentID, concept)
                },
                onSave: { payload in
                    let saved = try await persistence.saveAgentAvatar(generator.agentID, payload)
                    await MainActor.run {
                        updateAgent(saved)
                    }
                }
            )
        }
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
            let draft = SettingsPerson(
                id: viewer.id,
                displayName: viewer.displayName,
                handle: viewer.handle,
                email: viewer.email,
                role: viewer.role,
                joined: viewer.joined,
                description: value,
                avatarURL: viewer.avatarURL,
                initials: viewer.initials
            )
            let saved = try await persistence.saveHumanProfile(
                draft.id,
                draft.displayName,
                draft.handle,
                draft.description
            )
            updateViewer(saved)
            return
        }

        guard let agent = data.agents.first(where: { $0.id == ownerID }) else { return }
        let draft = SettingsAgent(
            id: agent.id,
            displayName: agent.displayName,
            handle: agent.handle,
            description: value,
            runtime: agent.runtime,
            model: agent.model,
            status: agent.status,
            avatarURL: agent.avatarURL,
            presence: agent.presence,
            initials: agent.initials,
            canGenerateAvatar: agent.canGenerateAvatar,
            runtimeConfiguration: agent.runtimeConfiguration
        )
        let saved = try await persistence.saveAgentProfile(
            draft.id,
            draft.displayName,
            draft.description
        )
        updateAgent(saved)
    }
}

struct AvatarGeneratorSheet: Identifiable {
    let agentID: String
    let agentName: String

    var id: String { agentID }
}

#Preview("Settings sheet") {
    SettingsSheet()
}

#Preview("Settings sheet at Server") {
    SettingsSheet(initialPath: [.server])
}
