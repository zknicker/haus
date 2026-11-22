import SwiftUI

/// The Servers the viewer belongs to, and how to switch between them.
public struct ServerSwitcher {
    public struct Server: Identifiable, Hashable, Sendable {
        public let id: String
        public let name: String

        public init(id: String, name: String) {
            self.id = id
            self.name = name
        }
    }

    public let servers: [Server]
    public let activeServerID: String?
    public let onSwitch: (String) -> Void

    public init(servers: [Server], activeServerID: String?, onSwitch: @escaping (String) -> Void) {
        self.servers = servers
        self.activeServerID = activeServerID
        self.onSwitch = onSwitch
    }
}

/// You's Server row: the active Server, with a menu of the others.
struct ServerSwitcherSection: View {
    let switcher: ServerSwitcher

    var body: some View {
        SettingsSection(nil) {
            SettingsListGroup {
                Menu {
                    ForEach(switcher.servers) { server in
                        Button {
                            switcher.onSwitch(server.id)
                        } label: {
                            if server.id == switcher.activeServerID {
                                Label(server.name, systemImage: "checkmark")
                            } else {
                                Text(server.name)
                            }
                        }
                    }
                } label: {
                    SettingsRow(title: "Switch Server", value: activeName, icon: .server, showsDivider: false) {
                        SettingsChevron()
                    }
                }
                .tint(.primary)
                .accessibilityLabel("Switch Server, \(activeName)")
                .disabled(switcher.servers.count < 2)
            }
        }
    }

    private var activeName: String {
        switcher.servers.first { $0.id == switcher.activeServerID }?.name ?? ""
    }
}
