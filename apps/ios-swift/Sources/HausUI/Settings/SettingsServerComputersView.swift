import SwiftUI

/// The Server's Devices, one card each.
struct ServerComputersView: View {
    let computers: [SettingsComputer]?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if let computers, !computers.isEmpty {
                    SettingsListGroup {
                        ForEach(computers) { computer in
                            SettingsComputerRow(computer: computer, showsDivider: computer.id != computers.last?.id)
                        }
                    }
                    Text("Devices are managed by the Haus Computer app.")
                        .font(.footnote)
                        .foregroundStyle(HausPlatformColor.mutedInk)
                        .padding(.horizontal, SettingsCardMetrics.leadingInset)
                } else {
                    SettingsListGroup {
                        SettingsRow(
                            title: computers == nil ? "Devices unavailable" : "No devices attached",
                            subtitle: computers == nil
                                ? "Haus couldn’t load this Server’s devices."
                                : "No device has connected to this Server yet.",
                            icon: .computer,
                            showsDivider: false
                        ) {
                            EmptyView()
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(HausPlatformColor.canvas)
        .navigationTitle("Devices")
        .hausInlineNavigationTitle()
    }
}

private struct SettingsComputerRow: View {
    let computer: SettingsComputer
    let showsDivider: Bool

    private var subtitle: String {
        "\(computer.health) · \(computer.system)"
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: SettingsCardMetrics.iconGap) {
                HausIcon(.computer, size: SettingsCardMetrics.iconSide, weight: 1.6)
                    .frame(width: SettingsCardMetrics.iconSide)
                    .foregroundStyle(HausPlatformColor.mutedInk)

                SettingsValueLayout {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(computer.name)
                            .font(.body)
                            .foregroundStyle(HausPlatformColor.ink)
                            .fixedSize(horizontal: false, vertical: true)

                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Circle()
                                .fill(computer.isHealthy ? HausPlatformColor.positive : HausPlatformColor.faintInk)
                                .frame(width: 8, height: 8)
                                .accessibilityHidden(true)
                            Text(subtitle)
                                .font(.subheadline)
                                .foregroundStyle(HausPlatformColor.mutedInk)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                } value: {
                    Text(computer.version)
                        .font(.subheadline)
                        .foregroundStyle(HausPlatformColor.mutedInk)
                        .settingsRowValueText()
                }
            }
            .padding(.vertical, 10)
            .frame(minHeight: 64)
            .padding(.leading, SettingsCardMetrics.leadingInset)
            .padding(.trailing, SettingsCardMetrics.trailingInset)

            if showsDivider {
                SettingsSeparator()
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(computer.name), \(subtitle)")
    }
}

#Preview("Devices") {
    NavigationStack {
        ServerComputersView(computers: SettingsFixtures.computers)
    }
}
