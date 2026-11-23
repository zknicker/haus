import HausModels
import SwiftUI

/// The model connections Captains run on, with their readiness and usage,
/// then the cloud agent Workers can be delegated to.
struct ModelsConnectionsView: View {
    let connections: [SettingsModelConnection]?
    let onOpenUsage: () -> Void
    let onOpenCloudAgents: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if let connections {
                    SettingsSection("Connections", footer: Self.connectionsFooter) {
                        SettingsListGroup {
                            if connections.isEmpty {
                                AutomationNote("No model connections yet.")
                            }
                            ForEach(connections) { connection in
                                ModelConnectionRow(
                                    connection: connection,
                                    showsDivider: connection.id != connections.last?.id
                                )
                            }
                        }
                    }
                    if !connections.isEmpty {
                        SettingsListGroup {
                            DisclosureRow("Usage", icon: .reminder, showsDivider: false, action: onOpenUsage)
                        }
                    }
                }
                SettingsSection("Workers", footer: "Captains can hand code changes to a cloud agent.") {
                    SettingsListGroup {
                        DisclosureRow("Cloud agents", icon: .cloud, showsDivider: false, action: onOpenCloudAgents)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(HausPlatformColor.canvas)
        .navigationTitle("Models & connections")
        .hausInlineNavigationTitle()
    }

    nonisolated static let connectionsFooter = "Captains pick their models from these connections."
}

private struct ModelConnectionRow: View {
    let connection: SettingsModelConnection
    let showsDivider: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: SettingsCardMetrics.iconGap) {
                ModelProviderMark(provider: connection.provider, size: 17, isTinted: true)
                    .frame(width: SettingsCardMetrics.iconSide)
                SettingsValueLayout {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(connection.title)
                            .font(.body)
                            .foregroundStyle(HausPlatformColor.ink)
                            .fixedSize(horizontal: false, vertical: true)
                        if let detail = connection.detailLine {
                            Text(detail)
                                .font(.subheadline)
                                .foregroundStyle(HausPlatformColor.mutedInk)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                } value: {
                    Text(connection.statusLabel)
                        .font(.body)
                        .foregroundStyle(connection.isEnabled && !connection.isReady
                            ? HausPlatformColor.critical
                            : HausPlatformColor.mutedInk)
                        .settingsRowValueText()
                }
            }
            .padding(.vertical, 10)
            .frame(minHeight: SettingsCardMetrics.rowHeight)
            .padding(.leading, SettingsCardMetrics.leadingInset)
            .padding(.trailing, SettingsCardMetrics.trailingInset)

            if showsDivider { SettingsSeparator() }
        }
        .accessibilityElement(children: .combine)
    }
}

/// The usage view the Model sheet opens, over every connection.
struct ModelConnectionsUsageView: View {
    let connections: [SettingsModelConnection]

    var body: some View {
        ModelUsageView(groups: connections.map(\.usageGroup))
    }
}

#Preview("Models & connections") {
    NavigationStack {
        ModelsConnectionsView(
            connections: SettingsFixtures.modelConnections,
            onOpenUsage: {},
            onOpenCloudAgents: {}
        )
    }
}
