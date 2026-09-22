import HausModels
import SwiftUI

/// Presents the Computer-owned Cursor sign-in wait. The sheet can be opened
/// from the phone, so the link is a native system link and can also be shared
/// to another browser or device. Polling lives in the sheet task and stops as
/// soon as the sheet is dismissed or the app leaves the active scene.
struct CloudAgentSignInView: View {
    let computerID: String
    let computerName: String
    let isOnline: Bool
    @Binding var capability: CloudAgentCapability?
    let actions: CloudAgentSettingsActions

    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var operation: CloudAgentConnectionOperation?
    @State private var failure: String?
    @State private var hasLoaded = false
    @State private var retryToken = 0
    @State private var consumedRetryToken = 0

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(computerName)
                            .font(.headline)
                        statusRow
                    }
                }

                if case .waiting(let url, let expiresAt) = presentation {
                    Section("Use this device") {
                        Link(destination: url) {
                            Label("Open Cursor sign-in", systemImage: "safari")
                        }
                        .accessibilityIdentifier("cloud-agent-open-sign-in")

                        ShareLink(item: url) {
                            Label("Share sign-in link", systemImage: "square.and.arrow.up")
                        }
                        .accessibilityIdentifier("cloud-agent-share-sign-in")

                        Text("This link expires \(expiresAt.formatted(date: .abbreviated, time: .shortened)).")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                if case .failed(let message) = presentation {
                    Section {
                        Label(message, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                    .accessibilityIdentifier("cloud-agent-sign-in-error")
                }

                if let failure, case .waiting = presentation {
                    Section {
                        Label(failure, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                    .accessibilityIdentifier("cloud-agent-sign-in-action-error")
                }
            }
            .navigationTitle("Sign in to Cursor")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    actionButton
                }
            }
            .task(id: taskIdentity) {
                guard scenePhase == .active, isOnline else { return }
                let forceConnect = retryToken != consumedRetryToken
                consumedRetryToken = retryToken
                await runSignInFlow(forceConnect: forceConnect)
            }
        }
    }

    @ViewBuilder
    private var statusRow: some View {
        switch presentation {
        case .starting:
            HStack(spacing: 10) {
                ProgressView()
                Text("Preparing your sign-in link…")
            }
        case .waiting:
            HStack(spacing: 10) {
                ProgressView()
                VStack(alignment: .leading, spacing: 2) {
                    Text("Waiting for you to sign in")
                    Text("Haus will finish connecting automatically.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        case .connected(let email):
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Ready for Cloud Agents")
                    Text(email.map { "Connected as \($0)." } ?? "This Computer can now start Cloud Agents.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            } icon: {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            }
        case .failed:
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Sign-in incomplete")
                    Text("Try again to get a new sign-in link.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            } icon: {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
            }
        case .offline:
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Computer offline")
                    Text("Reconnect your Computer to continue.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            } icon: {
                Image(systemName: "wifi.exclamationmark")
            }
        }
    }

    @ViewBuilder
    private var actionButton: some View {
        switch presentation {
        case .connected:
            Button("Done") { dismiss() }
        case .waiting:
            Button("Cancel sign-in", role: .cancel) {
                Task { await cancelSignIn() }
            }
            .disabled(operation != nil)
        case .failed:
            Button("Try again") {
                retryToken += 1
            }
            .disabled(operation != nil || !isOnline)
        case .starting:
            Button("Close") { dismiss() }
        case .offline:
            Button("Close") { dismiss() }
        }
    }

    private var presentation: CloudAgentSignInPresentation {
        CloudAgentSignInModel.presentation(
            capability: capability,
            isOffline: !isOnline,
            isStarting: !hasLoaded || operation == .connect,
            errorMessage: failure
        )
    }

    private struct TaskIdentity: Equatable {
        let scenePhase: ScenePhase
        let isOnline: Bool
        let retryToken: Int
    }

    private var taskIdentity: TaskIdentity {
        TaskIdentity(scenePhase: scenePhase, isOnline: isOnline, retryToken: retryToken)
    }

    private func runSignInFlow(forceConnect: Bool) async {
        let initialCapability = capability
        let flow = CloudAgentSignInFlow(
            perform: { requested in
                operation = requested
                if requested != .get { failure = nil }
                defer {
                    operation = nil
                    hasLoaded = true
                }
                do {
                    return try await actions.perform(computerID, requested)
                } catch is CancellationError {
                    throw CancellationError()
                } catch {
                    failure = failureMessage(for: requested)
                    throw error
                }
            },
            pollInterval: .seconds(2)
        )

        do {
            try await flow.run(
                forceConnect: forceConnect,
                initialCapability: initialCapability
            ) { state in
                capability = state
                hasLoaded = true
            }
        } catch is CancellationError {
            return
        } catch {
            // The operation closure already translated the request failure for the sheet.
        }
    }

    private func cancelSignIn() async {
        guard operation == nil else { return }
        operation = .cancelSignIn
        failure = nil
        defer {
            operation = nil
            hasLoaded = true
        }
        do {
            capability = try await actions.perform(computerID, .cancelSignIn)
            dismiss()
        } catch is CancellationError {
            return
        } catch {
            failure = failureMessage(for: .cancelSignIn)
        }
    }

    private func failureMessage(for operation: CloudAgentConnectionOperation) -> String {
        switch operation {
        case .get:
            "Could not check Cursor sign-in status. Check that this Computer is online and try again."
        case .connect:
            "Could not start Cursor sign-in. Check that this Computer is online and try again."
        case .cancelSignIn:
            "Could not cancel sign-in. Try again."
        case .disconnect:
            "Could not disconnect Cursor. Try again."
        }
    }
}
