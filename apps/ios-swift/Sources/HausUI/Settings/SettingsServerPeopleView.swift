import SwiftUI

struct ServerPeopleView: View {
    let members: [SettingsPerson]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                SettingsSection("Members") {
                    SettingsListGroup {
                        if members.isEmpty {
                            SettingsRow(
                                title: "No members",
                                icon: .members,
                                showsDivider: false
                            ) {
                                EmptyView()
                            }
                        } else {
                            ForEach(Array(members.enumerated()), id: \.element.id) { index, member in
                                SettingsMemberRow(
                                    member: member,
                                    showsDivider: index < members.count - 1
                                )
                            }
                        }
                    }
                }

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(HausPlatformColor.groupedBackground)
        .navigationTitle("People")
        .hausInlineNavigationTitle()
    }
}

private struct SettingsMemberRow: View {
    let member: SettingsPerson
    let showsDivider: Bool

    private var subtitle: String? {
        if let email = member.email, email != member.displayName {
            return email
        }
        guard let handle = member.handle, !handle.isEmpty else { return nil }
        return "@\(handle)"
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                AvatarView(
                    name: member.displayName,
                    url: member.avatarURL,
                    initials: member.initials,
                    size: 42
                )

                SettingsValueLayout {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(member.displayName)
                            .font(.body)
                            .foregroundStyle(.primary)
                            .fixedSize(horizontal: false, vertical: true)
                        if let subtitle {
                            Text(subtitle)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                } value: {
                    Text(member.role)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .settingsRowValueText()
                }
            }
            .padding(.vertical, 10)
            .frame(minHeight: 76)
            .padding(.horizontal, 16)

            if showsDivider {
                Divider().padding(.leading, 72)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(member.displayName), \(member.role)")
    }
}

#Preview("People") {
    NavigationStack {
        ServerPeopleView(members: [SettingsFixtures.viewer])
    }
}
