import SwiftUI

struct SettingsHubView: View {
    let data: SettingsData
    @Binding var appearance: AppearancePreference
    var notifications = PushNotificationsSetting()
    let onNavigate: (SettingsRoute) -> Void
    var onSignOut: SettingsSignOut?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                SettingsIdentityHeader(
                    viewer: data.viewer,
                    action: { onNavigate(.profile) }
                )

                if !data.agents.isEmpty {
                    SettingsSection("Agent profiles") {
                        SettingsListGroup {
                            ForEach(Array(data.agents.enumerated()), id: \.element.id) { index, agent in
                                SettingsAgentRow(
                                    agent: agent,
                                    showsDivider: index < data.agents.count - 1,
                                    action: { onNavigate(.agent(id: agent.id)) }
                                )
                            }
                        }
                    }
                }

                SettingsSection("Server") {
                    SettingsListGroup {
                        DisclosureRow(
                            "Server",
                            value: data.server.name,
                            icon: .server,
                            action: { onNavigate(.server) }
                        )
                        DisclosureRow(
                            "People",
                            icon: .members,
                            action: { onNavigate(.people) }
                        )
                        DisclosureRow(
                            "Computers",
                            icon: .computer,
                            showsDivider: false,
                            action: { onNavigate(.computers) }
                        )
                    }
                }

                SettingsSection("Connections") {
                    SettingsListGroup {
                        DisclosureRow(
                            "Cloud agents",
                            icon: .cloud,
                            showsDivider: false,
                            action: { onNavigate(.cloudAgents) }
                        )
                    }
                }

                PushNotificationsSection(setting: notifications)

                SettingsSection("Preferences", footer: ShowTasksInChat.footer) {
                    SettingsListGroup {
                        PickerRow(
                            "Appearance",
                            value: appearance,
                            icon: .appearance,
                            options: AppearancePreference.allCases.map { ($0, $0.title) },
                            onChange: { appearance = $0 }
                        )
                        ShowTasksInChatRow()
                    }
                }

                SettingsSection(nil) {
                    SettingsListGroup {
                        DisclosureRow(
                            "About",
                            icon: .info,
                            showsDivider: false,
                            action: { onNavigate(.appInfo) }
                        )
                    }
                }

                if let onSignOut {
                    SettingsSignOutSection(signOut: onSignOut)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(HausPlatformColor.groupedBackground)
    }
}

/// The root's centered identity: no card, the whole block opens the profile.
private struct SettingsIdentityHeader: View {
    let viewer: SettingsPerson
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                AvatarView(
                    name: viewer.displayName,
                    url: viewer.avatarURL,
                    initials: viewer.initials,
                    size: 84
                )
                Text(viewer.displayName)
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.center)
                if let handle = viewer.handle, !handle.isEmpty {
                    Text("@\(handle)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            [viewer.displayName, viewer.handle.flatMap { $0.isEmpty ? nil : "@\($0)" }]
                .compactMap { $0 }
                .joined(separator: ", ")
        )
        .accessibilityHint("Opens your profile")
    }
}

private struct SettingsAgentRow: View {
    let agent: SettingsAgent
    let showsDivider: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                AvatarView(
                    name: agent.displayName,
                    url: agent.avatarURL,
                    initials: agent.initials,
                    presence: agent.presence,
                    size: 30
                )
                Text(agent.displayName)
                    .font(.body)
                    .foregroundStyle(.primary)
                    .layoutPriority(1)
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }
            .padding(.vertical, 10)
            .frame(minHeight: 52)
            .padding(.horizontal, 16)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open \(agent.displayName) profile")
        .overlay(alignment: .bottom) {
            if showsDivider {
                Divider().padding(.leading, 60)
            }
        }
    }
}

#Preview("Settings hub") {
    NavigationStack {
        SettingsHubView(
            data: SettingsFixtures.data,
            appearance: .constant(.system),
            onNavigate: { _ in },
            onSignOut: {}
        )
        .navigationTitle("Settings")
    }
}
