import HausModels
import SwiftUI

/// You's root: the profile, Automations and Drive, this device's settings,
/// the Server's, then About and Sign out. Every row pushes a screen, or
/// beside a content pane selects it and shows as `selection`.
struct SettingsHubView: View {
    let data: SettingsData
    @Binding var appearance: AppearancePreference
    var notifications = PushNotificationsSetting()
    var projectCount: Int?
    var selection: SettingsRoute?
    let onNavigate: (SettingsRoute) -> Void
    var onSignOut: SettingsSignOut?
    var serverSwitcher: ServerSwitcher?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(spacing: 12) {
                    SettingsListGroup {
                        SettingsProfileRow(viewer: data.viewer, serverName: data.server.name) {
                            onNavigate(.profile)
                        }
                        .listSelection(selection == .profile)
                    }
                    if let serverSwitcher, serverSwitcher.servers.count > 1 {
                        ServerSwitcherSection(switcher: serverSwitcher)
                    }
                }

                SettingsListGroup {
                    if data.canManageServer {
                        row(.automations) { DisclosureRow("Automations", icon: .reminder, action: $0) }
                    }
                    row(.drive(prefix: "")) { DisclosureRow("Drive", icon: .folder, showsDivider: false, action: $0) }
                }

                SettingsSection("Settings") {
                    SettingsListGroup {
                        row(.general) { DisclosureRow("General", icon: .settings, action: $0) }
                        row(.notifications) {
                            DisclosureRow(
                                "Notifications",
                                value: notifications.isOn ? "On" : "Off",
                                icon: .notification,
                                action: $0
                            )
                        }
                        PickerRow(
                            "Appearance",
                            value: appearance,
                            icon: .appearance,
                            options: AppearancePreference.allCases.map { ($0, $0.title) },
                            onChange: { appearance = $0 }
                        )
                        AppIconRow(showsDivider: false)
                    }
                }

                SettingsSection("Server") {
                    SettingsListGroup {
                        row(.captains) {
                            DisclosureRow("Captains", value: String(data.agents.count), icon: .agents, action: $0)
                        }
                        row(.models) { DisclosureRow("Models & connections", icon: .skill, action: $0) }
                        row(.projects) {
                            DisclosureRow("Projects", value: projectCount.map(String.init), icon: .channel, action: $0)
                        }
                        row(.computers) {
                            DisclosureRow("Devices", value: data.devicesValue, icon: .computer, action: $0)
                        }
                        row(.people) {
                            DisclosureRow(
                                "People",
                                value: String(data.members.count),
                                icon: .members,
                                showsDivider: false,
                                action: $0
                            )
                        }
                    }
                }

                SettingsListGroup {
                    row(.server) { DisclosureRow("Server", value: data.server.name, icon: .server, action: $0) }
                    row(.appInfo) { DisclosureRow("About", icon: .info, showsDivider: false, action: $0) }
                }

                if let onSignOut {
                    SettingsSignOutSection(signOut: onSignOut)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 28)
        }
        .reportsChromeScroll()
        .scrollIndicators(.hidden)
        .background(HausPlatformColor.canvas)
    }

    private func row(_ route: SettingsRoute, _ content: (@escaping () -> Void) -> DisclosureRow) -> some View {
        content { onNavigate(route) }.listSelection(selection == route)
    }
}

#Preview("You") {
    NavigationStack {
        SettingsHubView(
            data: SettingsFixtures.data,
            appearance: .constant(.system),
            projectCount: 3,
            onNavigate: { _ in },
            onSignOut: {}
        )
        .navigationTitle("You")
    }
}

#Preview("You, accessibility size") {
    NavigationStack {
        SettingsHubView(
            data: SettingsFixtures.data,
            appearance: .constant(.system),
            projectCount: 3,
            onNavigate: { _ in },
            onSignOut: {}
        )
        .navigationTitle("You")
    }
    .dynamicTypeSize(.accessibility3)
}
