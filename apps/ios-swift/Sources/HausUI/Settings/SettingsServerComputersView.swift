import SwiftUI

/// The Server's Devices, one card each, with the "Workers can run here"
/// switch wherever the Server reports it.
struct ServerComputersView: View {
    let computers: [SettingsComputer]?
    let setWorkers: @Sendable (String, Bool) async throws -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if let computers, !computers.isEmpty {
                    ForEach(computers) { computer in
                        SettingsSection(nil, footer: computer.workers.map(Self.workersFooter)) {
                            SettingsListGroup {
                                SettingsComputerRow(computer: computer, showsDivider: computer.workers != nil)
                                if let workers = computer.workers {
                                    ComputerWorkersRow(computer: computer, workers: workers, setWorkers: setWorkers)
                                }
                            }
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

    nonisolated static func workersFooter(_ workers: SettingsComputerWorkers) -> String {
        let base = "Captains can start Workers on this device while the switch is on."
        return workers.canChange ? base : "\(base) The person who attached it, an Owner, or an Admin can change it."
    }
}

/// The switch writes through `computer.setWorkers` and shows the asked-for
/// value until the Server's `computer.list` reports it.
private struct ComputerWorkersRow: View {
    let computer: SettingsComputer
    let workers: SettingsComputerWorkers
    let setWorkers: @Sendable (String, Bool) async throws -> Void
    @State private var pending: Bool?
    @State private var failure: String?

    var body: some View {
        SettingsToggleRow(
            "Workers can run here",
            subtitle: failure,
            icon: .terminal,
            isOn: Binding(get: { pending ?? workers.isEnabled }, set: { change($0) }),
            showsDivider: false
        )
        .disabled(!workers.canChange || pending != nil)
        .onChange(of: workers.isEnabled) { _, reported in
            if reported == pending { pending = nil }
        }
    }

    private func change(_ enabled: Bool) {
        pending = enabled
        failure = nil
        Task {
            do {
                try await setWorkers(computer.id, enabled)
                if workers.isEnabled == enabled { pending = nil }
            } catch {
                pending = nil
                failure = "Couldn’t change this. Try again."
            }
        }
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
        ServerComputersView(computers: SettingsFixtures.computers, setWorkers: { _, _ in })
    }
}
