import SwiftUI
import HausModels

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
    @Environment(\.dismiss) var dismiss
    let persistence: SettingsPersistence
    let cloudAgentActions: WorkerSettingsActions
    let automations: AgentAutomationsActions
    let stoppedClaims: AgentStoppedClaimsActions
    let onSignOut: SettingsSignOut?
    let notifications: PushNotificationsSetting
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

    private var tabRoot: some View {
        SettingsHubView(
            data: data,
            appearance: $appearance,
            notifications: notifications,
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

    private var sheet: some View {
        NavigationStack(path: $ownedPath) {
            // The hub carries the same system navigation bar its pushed screens
            // do. It must not hide the bar and draw a `ChromeHeader` instead:
            // inside a sheet, a hidden-to-visible bar toggle lays the pushed
            // screen out against the pre-push top safe area, so it drew one
            // grabber-height too high for the whole transition and dropped into
            // place a frame after it ended.
            SettingsHubView(
                data: data,
                appearance: $appearance,
                notifications: notifications,
                onNavigate: { path.append($0) },
                onSignOut: onSignOut
            )
            .navigationTitle("Settings")
            .hausInlineNavigationTitle()
            .toolbar {
                // The same Done every other sheet in the app closes with.
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
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
            let draft = SettingsPerson(
                id: viewer.id,
                displayName: viewer.displayName,
                handle: viewer.handle,
                email: viewer.email,
                role: viewer.role,
                joined: viewer.joined,
                description: value,
                avatarURL: viewer.avatarURL,
                initials: viewer.initials,
                timezone: viewer.timezone
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
    let avatarURL: URL?
    let initials: String
    let session: AvatarGenerationSession

    var id: String { agentID }
}

#Preview("Settings sheet") {
    SettingsSheet()
}

#Preview("Settings sheet at Server") {
    SettingsSheet(initialPath: [.server])
}
