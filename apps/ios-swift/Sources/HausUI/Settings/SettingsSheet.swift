import SwiftUI
import HausModels

/// Settings as the You tab's root: the hub under a "You" title, with its
/// screens pushed onto the tab's own stack.
public struct SettingsSheet: View {
    let persistence: SettingsPersistence
    let cloudAgentActions: WorkerSettingsActions
    let automations: AgentAutomationsActions
    let stoppedClaims: AgentStoppedClaimsActions
    let onSignOut: SettingsSignOut?
    let notifications: PushNotificationsSetting
    let server: SettingsServerContent
    @State var data: SettingsData
    private let tabPath: Binding<[SettingsRoute]>
    private let sourceData: SettingsData
    private let serverSwitcher: ServerSwitcher?
    @State var avatarGenerator: AvatarGeneratorSheet?
    /// One generation session per Agent, kept for the life of Settings so that
    /// closing the generator never discards variants or a run in flight.
    @State var avatarSessions: [String: AvatarGenerationSession] = [:]
    @Binding private var appearance: AppearancePreference

    var path: [SettingsRoute] {
        get { tabPath.wrappedValue }
        nonmutating set { tabPath.wrappedValue = newValue }
    }

    public init(
        tabPath: Binding<[SettingsRoute]>,
        data: SettingsData,
        persistence: SettingsPersistence,
        cloudAgentActions: WorkerSettingsActions,
        automations: AgentAutomationsActions,
        stoppedClaims: AgentStoppedClaimsActions,
        notifications: PushNotificationsSetting,
        server: SettingsServerContent,
        appearance: Binding<AppearancePreference>,
        serverSwitcher: ServerSwitcher?,
        onSignOut: SettingsSignOut?
    ) {
        self.onSignOut = onSignOut
        self.persistence = persistence
        self.cloudAgentActions = cloudAgentActions
        self.automations = automations
        self.stoppedClaims = stoppedClaims
        self.notifications = notifications
        self.server = server
        _data = State(initialValue: data)
        _appearance = appearance
        self.tabPath = tabPath
        sourceData = data
        self.serverSwitcher = serverSwitcher
    }

    public var body: some View {
        SettingsHubView(
            data: data,
            appearance: $appearance,
            notifications: notifications,
            projectCount: server.projects?.count,
            onNavigate: { path.append($0) },
            onSignOut: onSignOut,
            serverSwitcher: serverSwitcher
        )
        .navigationTitle("You")
        .hausInlineNavigationTitle()
        .navigationDestination(for: SettingsRoute.self) { route in
            destination(for: route)
        }
        .onChange(of: sourceData) { _, latest in data = latest }
        .sheet(item: $avatarGenerator) { generator in avatarGeneration(generator) }
    }

    private func avatarGeneration(_ generator: AvatarGeneratorSheet) -> some View {
        AgentAvatarGenerationView(
            agentName: generator.agentName,
            currentAvatarURL: generator.avatarURL,
            initials: generator.initials,
            session: generator.session,
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

#Preview("You") {
    @Previewable @State var path: [SettingsRoute] = []

    NavigationStack(path: $path) {
        SettingsSheet(
            tabPath: $path,
            data: SettingsFixtures.data,
            persistence: .preview,
            cloudAgentActions: .unavailable,
            automations: .preview,
            stoppedClaims: .unavailable,
            notifications: PushNotificationsSetting(),
            server: .preview,
            appearance: .constant(.system),
            serverSwitcher: nil,
            onSignOut: nil
        )
    }
}
