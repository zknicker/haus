import SwiftUI
import HausModels

/// Settings in the You tab. Stacked, the hub under a "You" title is the
/// root and its screens push onto the tab's own stack. Split, the hub is the
/// list and selects a row, and the content pane draws that row's screen as
/// `root` with the screens it pushes over it.
public struct SettingsSheet: View {
    private let root: SettingsRoute?
    private let selection: SettingsListSelection?
    let persistence: SettingsPersistence
    let automations: AgentAutomationsActions
    let stoppedClaims: AgentStoppedClaimsActions
    let onSignOut: SettingsSignOut?
    let notifications: PushNotificationsSetting
    let server: SettingsServerContent
    @State var data: SettingsData
    private let tabPath: Binding<[SettingsRoute]>
    private let sourceData: SettingsData
    private let serverSwitcher: ServerSwitcher?
    /// A screen this pushed appeared, as the tab's other routes report theirs.
    private let onScreenAppear: (SettingsRoute) -> Void
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
        root: SettingsRoute? = nil,
        selection: SettingsListSelection? = nil,
        tabPath: Binding<[SettingsRoute]>,
        data: SettingsData,
        persistence: SettingsPersistence,
        automations: AgentAutomationsActions,
        stoppedClaims: AgentStoppedClaimsActions,
        notifications: PushNotificationsSetting,
        server: SettingsServerContent,
        appearance: Binding<AppearancePreference>,
        serverSwitcher: ServerSwitcher?,
        onSignOut: SettingsSignOut?,
        onScreenAppear: @escaping (SettingsRoute) -> Void = { _ in }
    ) {
        self.onScreenAppear = onScreenAppear
        self.root = root
        self.selection = selection
        self.onSignOut = onSignOut
        self.persistence = persistence
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
        content.onChange(of: sourceData) { _, latest in data = latest }
    }

    @ViewBuilder
    private var content: some View {
        if let selection {
            hub(selected: selection.route, onNavigate: selection.select)
        } else {
            Group {
                if let root {
                    destination(for: root)
                } else {
                    hub(selected: nil) { path.append($0) }
                }
            }
            .navigationDestination(for: SettingsRoute.self) { route in
                destination(for: route).onAppear { onScreenAppear(route) }
            }
            .sheet(item: $avatarGenerator) { generator in avatarGeneration(generator) }
        }
    }

    private func hub(selected: SettingsRoute?, onNavigate: @escaping (SettingsRoute) -> Void) -> some View {
        SettingsHubView(
            data: data,
            appearance: $appearance,
            notifications: notifications,
            projectCount: server.projects?.count,
            selection: selected,
            onNavigate: onNavigate,
            onSignOut: onSignOut,
            serverSwitcher: serverSwitcher
        )
        .hausScreenTitle("You")
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

/// The hub as a list beside the content pane: the row it shows as selected,
/// and what a row's tap selects.
public struct SettingsListSelection {
    let route: SettingsRoute?
    let select: (SettingsRoute) -> Void

    public init(route: SettingsRoute?, select: @escaping (SettingsRoute) -> Void) {
        self.route = route
        self.select = select
    }
}

#Preview("You") {
    @Previewable @State var path: [SettingsRoute] = []

    NavigationStack(path: $path) {
        SettingsSheet(
            tabPath: $path,
            data: SettingsFixtures.data,
            persistence: .preview,
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
