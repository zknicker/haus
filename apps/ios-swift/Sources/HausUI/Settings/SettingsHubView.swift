import HausModels
import SwiftUI

/// You's root: the profile, Automations and Drive, this device's settings,
/// the Server's, then About and Sign out. Every row pushes a screen.
struct SettingsHubView: View {
    let data: SettingsData
    @Binding var appearance: AppearancePreference
    var notifications = PushNotificationsSetting()
    var projectCount: Int?
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
                    }
                    if let serverSwitcher, serverSwitcher.servers.count > 1 {
                        ServerSwitcherSection(switcher: serverSwitcher)
                    }
                }

                SettingsListGroup {
                    if data.canManageServer {
                        DisclosureRow("Automations", icon: .reminder) { onNavigate(.automations) }
                    }
                    DisclosureRow("Drive", icon: .folder, showsDivider: false) { onNavigate(.drive(prefix: "")) }
                }

                SettingsSection("Settings") {
                    SettingsListGroup {
                        DisclosureRow("General", icon: .settings) { onNavigate(.general) }
                        DisclosureRow(
                            "Notifications",
                            value: notifications.isOn ? "On" : "Off",
                            icon: .notification
                        ) { onNavigate(.notifications) }
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
                        DisclosureRow("Captains", value: String(data.agents.count), icon: .agents) {
                            onNavigate(.captains)
                        }
                        DisclosureRow("Models & connections", icon: .skill) { onNavigate(.models) }
                        DisclosureRow("Projects", value: projectCount.map(String.init), icon: .channel) {
                            onNavigate(.projects)
                        }
                        DisclosureRow("Devices", value: data.devicesValue, icon: .computer) {
                            onNavigate(.computers)
                        }
                        DisclosureRow("People", value: String(data.members.count), icon: .members, showsDivider: false) {
                            onNavigate(.people)
                        }
                    }
                }

                SettingsListGroup {
                    DisclosureRow("Server", value: data.server.name, icon: .server) { onNavigate(.server) }
                    DisclosureRow("About", icon: .info, showsDivider: false) { onNavigate(.appInfo) }
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
