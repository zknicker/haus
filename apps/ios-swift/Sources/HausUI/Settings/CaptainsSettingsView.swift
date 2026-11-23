import SwiftUI

/// The Server's Captains, each opening its profile.
struct CaptainsSettingsView: View {
    let agents: [SettingsAgent]
    let onOpen: (String) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                SettingsListGroup {
                    if agents.isEmpty {
                        AutomationNote("No Captains yet.")
                    }
                    ForEach(agents) { agent in
                        SettingsCaptainRow(
                            agent: agent,
                            value: agent.status,
                            showsDivider: agent.id != agents.last?.id
                        ) { onOpen(agent.id) }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(HausPlatformColor.canvas)
        .navigationTitle("Captains")
        .hausInlineNavigationTitle()
    }
}

/// A card row led by a Captain's squircle mark.
struct SettingsCaptainRow: View {
    let agent: SettingsAgent
    let value: String?
    let showsDivider: Bool
    let action: () -> Void

    @ScaledMetric(relativeTo: .body) private var markSide: CGFloat = 24

    var body: some View {
        Button(action: action) {
            HStack(spacing: SettingsCardMetrics.iconGap) {
                CaptainMark(name: agent.displayName, side: markSide, isWorking: agent.presence == .working) {
                    AvatarView(
                        name: agent.displayName,
                        url: agent.avatarURL,
                        initials: agent.initials,
                        size: markSide * 2.squareRoot()
                    )
                }
                SettingsValueLayout {
                    Text(agent.displayName)
                        .font(.body)
                        .foregroundStyle(HausPlatformColor.ink)
                } value: {
                    if let value {
                        Text(value)
                            .font(.body)
                            .foregroundStyle(HausPlatformColor.mutedInk)
                            .settingsRowValueText()
                    }
                }
                SettingsChevron()
                    .padding(.leading, SettingsCardMetrics.valueGap - SettingsCardMetrics.iconGap)
            }
            .padding(.vertical, 10)
            .frame(minHeight: SettingsCardMetrics.rowHeight)
            .padding(.leading, SettingsCardMetrics.leadingInset)
            .padding(.trailing, SettingsCardMetrics.trailingInset)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel([agent.displayName, value].compactMap { $0 }.joined(separator: ", "))
        .overlay(alignment: .bottom) {
            if showsDivider { SettingsSeparator() }
        }
    }
}

#Preview("Captains") {
    NavigationStack {
        CaptainsSettingsView(agents: [SettingsFixtures.blippy], onOpen: { _ in })
    }
}
