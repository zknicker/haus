import SwiftUI
import HausModels

public enum WorkerConnectionOperation: String, Sendable {
    case get, connect, disconnect
    case cancelSignIn
}

public struct WorkerSettingsActions: Sendable {
    public let perform: @Sendable (String, WorkerConnectionOperation) async throws -> WorkerCapability
    /// `cloudAgentSettings.get` for the active Server.
    public let loadModel: @Sendable () async throws -> WorkerSettings
    /// `cloudAgentSettings.setModel`; Owner/Admin only.
    public let setModel: @Sendable (WorkerModelSetting) async throws -> WorkerSettings

    public init(
        perform: @escaping @Sendable (String, WorkerConnectionOperation) async throws -> WorkerCapability,
        loadModel: @escaping @Sendable () async throws -> WorkerSettings,
        setModel: @escaping @Sendable (WorkerModelSetting) async throws -> WorkerSettings
    ) {
        self.perform = perform
        self.loadModel = loadModel
        self.setModel = setModel
    }

    public static let unavailable = Self(
        perform: { _, _ in throw CancellationError() },
        loadModel: { throw CancellationError() },
        setModel: { _ in throw CancellationError() }
    )
}

struct WorkerSettingsView: View {
    let computers: [SettingsComputer]?
    let canManage: Bool
    let actions: WorkerSettingsActions

    var body: some View {
        Form {
            Section {
                HStack(spacing: 12) {
                    WorkerMark()
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Cursor").font(.headline)
                        Text("Delegate code changes to a cloud agent.")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                }
            }
            WorkerModelSection(canManage: canManage, actions: actions)
            Section {
                if let computers {
                    if computers.isEmpty { Text("Attach a device to connect Cursor.") }
                    if canManage {
                        ForEach(computers) { computer in
                            CursorConnectionRow(computer: computer, canManage: canManage, actions: actions)
                        }
                    } else {
                        Text("An owner or admin can manage Cursor connections.")
                    }
                } else {
                    Text("Device connections are unavailable.")
                }
            } header: {
                Text("Devices")
            } footer: {
                Text("Connect opens a short-lived Cursor sign-in link. Credentials stay on the selected device, and its Captains can use Cursor from any Haus device.")
            }
        }
        .navigationTitle("Cloud agents")
        .hausInlineNavigationTitle()
    }
}

private struct CursorConnectionRow: View {
    let computer: SettingsComputer
    let canManage: Bool
    let actions: WorkerSettingsActions
    @State private var capability: WorkerCapability?
    @State private var operation: WorkerConnectionOperation?
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
            WorkerSignInView(
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
            Text("Captains on this device will need Cursor reconnected before starting more cloud work.")
        }
    }

    private func perform(_ requested: WorkerConnectionOperation) async {
        guard operation == nil else { return }
        operation = requested
        failure = nil
        defer { operation = nil }
        do {
            capability = try await actions.perform(computer.id, requested)
        } catch is CancellationError {
            return
        } catch {
            failure = "Could not \(requested == .get ? "check Cursor" : requested == .cancelSignIn ? "cancel sign-in" : requested.rawValue). Check that this device is online and try again."
        }
    }

    private func reasonLabel(_ reason: String) -> String {
        switch reason {
        case "not-connected": "Not connected"
        case "expired": "Sign-in expired. Reconnect Cursor."
        default: "Cursor is unavailable on this device."
        }
    }
}
