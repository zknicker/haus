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
                    HStack(spacing: 14) {
                        Image(systemName: "arrow.left.arrow.right")
                            .frame(width: 30)
                            .foregroundStyle(.secondary)
                        Text("Switch Server")
                            .foregroundStyle(.primary)
                        Spacer(minLength: 8)
                        Text(activeName)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                    .frame(minHeight: 52)
                    .padding(.horizontal, 16)
                    .contentShape(Rectangle())
                }
                .disabled(switcher.servers.count < 2)
            }
        }
    }

    private var activeName: String {
        switcher.servers.first { $0.id == switcher.activeServerID }?.name ?? ""
    }
}
