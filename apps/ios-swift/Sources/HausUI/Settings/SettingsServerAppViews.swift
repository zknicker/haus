import SwiftUI

struct ServerDetailsView: View {
    let server: SettingsServer

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                SettingsSection("Identity") {
                    SettingsListGroup {
                        ValueRow("Name", value: server.name, icon: .server)
                        ValueRow("Address", value: "/\(server.slug)", icon: .website)
                        ValueRow("Your role", value: server.role, icon: .permissions, showsDivider: false)
                    }
                }

                SettingsSection("People") {
                    SettingsListGroup {
                        ValueRow("Agents", value: String(server.agentCount), icon: .agents)
                        ValueRow("Members", value: String(server.memberCount), icon: .members, showsDivider: false)
                    }
                }

                Text("Server identity is shared with every Haus client.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 16)
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(HausPlatformColor.groupedBackground)
        .navigationTitle("Server")
        .hausInlineNavigationTitle()
    }
}

struct AppInfoView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                SettingsSection("About") {
                    SettingsListGroup {
                        ValueRow("Version", value: AppVersionInfo.current, icon: .info, showsDivider: false)
                    }
                }

                Text("Haus for iPhone connects to your Haus Server and Computers.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 16)
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(HausPlatformColor.groupedBackground)
        .navigationTitle("Haus for iPhone")
        .hausInlineNavigationTitle()
    }
}

struct SettingsUnavailableView: View {
    let title: String

    var body: some View {
        // `ContentUnavailableView` is a system surface and takes an SF Symbol.
        ContentUnavailableView(
            title,
            systemImage: "questionmark.circle",
            description: Text("This settings screen is unavailable.")
        )
        .navigationTitle(title)
        .hausInlineNavigationTitle()
    }
}

#Preview("Server") {
    NavigationStack {
        ServerDetailsView(server: SettingsFixtures.server)
    }
}

#Preview("App info") {
    NavigationStack {
        AppInfoView()
    }
}
