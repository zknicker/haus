import SwiftUI
import HausModels

public enum CloudAgentConnectionOperation: String, Sendable {
    case get, connect, disconnect
    case cancelSignIn
}

public struct CloudAgentSettingsActions: Sendable {
    public let perform: @Sendable (String, CloudAgentConnectionOperation) async throws -> CloudAgentCapability

    public init(perform: @escaping @Sendable (String, CloudAgentConnectionOperation) async throws -> CloudAgentCapability) {
        self.perform = perform
    }

    public static let unavailable = Self { _, _ in throw CancellationError() }
}

struct CloudAgentSettingsView: View {
    let computers: [SettingsComputer]?
    let canManage: Bool
    let actions: CloudAgentSettingsActions

    var body: some View {
        Form {
            Section {
                HStack(spacing: 12) {
                    CloudAgentMark()
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Cursor").font(.headline)
                        Text("Delegate code changes to a cloud agent.")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                }
            }
            Section {
                if let computers {
                    if computers.isEmpty { Text("Attach a Computer to connect Cursor.") }
                    if canManage {
                        ForEach(computers) { computer in
                            CursorConnectionRow(computer: computer, canManage: canManage, actions: actions)
                        }
                    } else {
                        Text("An owner or admin can manage Cursor connections.")
                    }
                } else {
                    Text("Computer connections are unavailable.")
                }
            } header: {
                Text("Computers")
            } footer: {
                Text("Connect opens a short-lived Cursor sign-in link. Credentials stay on the selected Computer, and its agents can use Cursor from any Haus device.")
            }
        }
        .navigationTitle("Cloud agents")
        .hausInlineNavigationTitle()
    }
}

private struct CursorConnectionRow: View {
    let computer: SettingsComputer
    let canManage: Bool
    let actions: CloudAgentSettingsActions
    @State private var capability: CloudAgentCapability?
    @State private var operation: CloudAgentConnectionOperation?
    @State private var failure: String?
    @State private var confirmDisconnect = false
    @State private var showsSignIn = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(computer.name).font(.headline)
                Spacer()
                Text(capability?.ready == true ? "Connected" : computer.health)
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let email = capability?.accountEmail { Text(email).font(.subheadline) }
            if let failure {
                Text(failure).font(.caption).foregroundStyle(.red)
            } else if let reason = capability?.reason {
                Text(reasonLabel(reason)).font(.caption).foregroundStyle(.secondary)
            }
            if operation != nil {
                ProgressView().controlSize(.small)
            } else if computer.isHealthy {
                HStack {
                    if canManage {
                        if capability?.ready == true {
                            Button("Disconnect", role: .destructive) { confirmDisconnect = true }
                        } else if capability?.reason != "provider-unavailable" {
                            Button("Connect Cursor") { showsSignIn = true }
                        }
                    }
                    Button("Refresh") { Task { await perform(.get) } }
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(.vertical, 4)
        .task(id: computer.isHealthy) {
            if computer.isHealthy { await perform(.get) }
        }
        .sheet(isPresented: $showsSignIn) {
            CloudAgentSignInView(
                computerID: computer.id,
                computerName: computer.name,
                isOnline: computer.isHealthy,
                capability: $capability,
                actions: actions
            )
        }
        .confirmationDialog("Disconnect Cursor on \(computer.name)?", isPresented: $confirmDisconnect) {
            Button("Disconnect", role: .destructive) { Task { await perform(.disconnect) } }
        } message: {
            Text("Agents on this Computer will need Cursor reconnected before starting more cloud work.")
        }
    }

    private func perform(_ requested: CloudAgentConnectionOperation) async {
        guard operation == nil else { return }
        operation = requested
        failure = nil
        defer { operation = nil }
        do {
            capability = try await actions.perform(computer.id, requested)
        } catch is CancellationError {
            return
        } catch {
            failure = "Could not \(requested == .get ? "check Cursor" : requested == .cancelSignIn ? "cancel sign-in" : requested.rawValue). Check that this Computer is online and try again."
        }
    }

    private func reasonLabel(_ reason: String) -> String {
        switch reason {
        case "not-connected": "Not connected"
        case "expired": "Sign-in expired. Reconnect Cursor."
        default: "Cursor is unavailable on this Computer."
        }
    }
}
