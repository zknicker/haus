import SwiftUI
import HausModels

public struct SettingsSheet: View {
    @Environment(\.dismiss) var dismiss
    let persistence: SettingsPersistence
    let cloudAgentActions: WorkerSettingsActions
    let automations: AgentAutomationsActions
    let stoppedClaims: AgentStoppedClaimsActions
    let onSignOut: SettingsSignOut?
    let notifications: PushNotificationsSetting
    let server: SettingsServerContent
    @State var data: SettingsData
    @State private var ownedPath: [SettingsRoute]
    /// The You tab's stack, when Settings is that tab's root rather than a sheet.
    private let tabPath: Binding<[SettingsRoute]>?
    private let sourceData: SettingsData
    private let serverSwitcher: ServerSwitcher?
    @State var avatarGenerator: AvatarGeneratorSheet?
    /// One generation session per Agent, kept for the life of Settings so that
    /// closing the generator never discards variants or a run in flight.
    @State var avatarSessions: [String: AvatarGenerationSession] = [:]
    @Binding private var appearance: AppearancePreference

    var path: [SettingsRoute] {
        get { tabPath?.wrappedValue ?? ownedPath }
        nonmutating set {
            if let tabPath { tabPath.wrappedValue = newValue } else { ownedPath = newValue }
        }
    }

    /// - Parameter initialPath: screens the sheet opens already pushed to, so a
    ///   deep link such as the sidebar's Server header lands on its screen with
    ///   the hub still behind it.
    public init(
        data: SettingsData = SettingsFixtures.data,
        persistence: SettingsPersistence = .preview,
        cloudAgentActions: WorkerSettingsActions = .unavailable,
        automations: AgentAutomationsActions = .preview,
        stoppedClaims: AgentStoppedClaimsActions = .unavailable,
        notifications: PushNotificationsSetting = PushNotificationsSetting(),
        server: SettingsServerContent = .preview,
        appearance: Binding<AppearancePreference> = .constant(.system),
        initialPath: [SettingsRoute] = [],
        onSignOut: SettingsSignOut? = nil
    ) {
        self.onSignOut = onSignOut
        self.persistence = persistence
        self.cloudAgentActions = cloudAgentActions
        self.automations = automations
        self.stoppedClaims = stoppedClaims
        self.notifications = notifications
        self.server = server
        _data = State(initialValue: data)
        _ownedPath = State(initialValue: initialPath)
        _appearance = appearance
        tabPath = nil
        sourceData = data
        serverSwitcher = nil
    }

    /// Settings as the You tab's root: the hub under a "You" title, with its
    /// screens pushed onto the tab's own stack.
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
        serverSwitcher: ServerSwitcher,
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
        _ownedPath = State(initialValue: [])
        _appearance = appearance
        self.tabPath = tabPath
        sourceData = data
        self.serverSwitcher = serverSwitcher
    }

    public var body: some View {
        if tabPath != nil {
            tabRoot
        } else {
            sheet
        }
    }

    private var hub: SettingsHubView {
        SettingsHubView(
            data: data,
            appearance: $appearance,
            notifications: notifications,
            projectCount: server.projects?.count,
            onNavigate: { path.append($0) },
            onSignOut: onSignOut,
            serverSwitcher: serverSwitcher
        )
    }

    private var tabRoot: some View {
        hub
            .navigationTitle("You")
            .hausInlineNavigationTitle()
            .navigationDestination(for: SettingsRoute.self) { route in
                destination(for: route)
            }
            .onChange(of: sourceData) { _, latest in data = latest }
            .sheet(item: $avatarGenerator) { generator in avatarGeneration(generator) }
    }

    private var sheet: some View {
        NavigationStack(path: $ownedPath) {
            // The hub carries the same system navigation bar its pushed screens
            // do. It must not hide the bar and draw a `ChromeHeader` instead:
            // inside a sheet, a hidden-to-visible bar toggle lays the pushed
            // screen out against the pre-push top safe area, so it drew one
            // grabber-height too high for the whole transition and dropped into
            // place a frame after it ended.
            hub
                .navigationTitle("Settings")
                .hausInlineNavigationTitle()
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Close", systemImage: "xmark") { dismiss() }
                    }
                }
                .navigationDestination(for: SettingsRoute.self) { route in
                    destination(for: route)
                }
        }
        // The Appearance picker lives in this sheet, so the sheet has to honor
        // the choice immediately; a presented sheet does not pick up a scheme
        // change made behind it.
        .preferredColorScheme(appearance.colorScheme)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HausPlatformColor.canvas)
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

#Preview("Settings sheet") {
    SettingsSheet()
}

#Preview("Settings sheet at Server") {
    SettingsSheet(initialPath: [.server])
}
