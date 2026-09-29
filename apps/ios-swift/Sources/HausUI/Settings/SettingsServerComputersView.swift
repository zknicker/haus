import SwiftUI

struct ServerComputersView: View {
    let computers: [SettingsComputer]?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                SettingsSection("Computers") {
                    SettingsListGroup {
                        if let computers, !computers.isEmpty {
                            ForEach(Array(computers.enumerated()), id: \.element.id) { index, computer in
                                SettingsComputerRow(
                                    computer: computer,
                                    showsDivider: index < computers.count - 1
                                )
                            }
                        } else {
                            SettingsRow(
                                title: computers == nil ? "Computers unavailable" : "No Computers attached",
                                subtitle: computers == nil
                                    ? "Haus couldn’t load this Server’s Computers."
                                    : "No Computer has connected to this Server yet.",
                                icon: .computer,
                                showsDivider: false
                            ) {
                                EmptyView()
                            }
                        }
                    }
                }

                if let computers, computers.count > 1 {
                    Text("Computers are managed by the Haus Computer app.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 16)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(HausPlatformColor.groupedBackground)
        .navigationTitle("Computers")
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
            HStack(spacing: 14) {
                HausIcon(.computer, size: 21, weight: 1.8)
                    .frame(width: 24)
                    .foregroundStyle(.primary)

                SettingsValueLayout {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(computer.name)
                            .font(.body)
                            .foregroundStyle(.primary)
                            .fixedSize(horizontal: false, vertical: true)

                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Circle()
                                .fill(computer.isHealthy ? Color.green : Color.secondary)
                                .frame(width: 8, height: 8)
                                .accessibilityHidden(true)
                            Text(subtitle)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                } value: {
                    Text(computer.version)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .settingsRowValueText()
                }
            }
            .padding(.vertical, 10)
            .frame(minHeight: 76)
            .padding(.horizontal, 16)

            if showsDivider {
                Divider().padding(.leading, 54)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(computer.name), \(subtitle)")
    }
}
