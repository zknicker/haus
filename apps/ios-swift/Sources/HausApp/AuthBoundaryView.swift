import HausTransport
import HausUI
import SwiftUI
import UIKit

struct AuthBoundaryView: View {
    @State private var model = AuthBoundaryModel()
    @State private var mountedSession: AppSession?
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if let session = mountedSession {
                AuthenticatedHausView(session: session, authClient: model.authClient)
                    .id(session.user.id)
            } else {
                signedOutContent
            }
        }
        .task { await model.start() }
        .onChange(of: model.phase, initial: true) { _, phase in
            switch phase {
            case let .authenticated(session):
                mountedSession = session
            case .signedOut:
                guard let outgoingSession = mountedSession else { return }
                dismissPresentedScreens {
                    guard model.phase == .signedOut,
                          mountedSession?.sessionId == outgoingSession.sessionId
                    else { return }
                    mountedSession = nil
                }
            case .loading, .failed:
                break
            }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await model.refreshSession() }
        }
        // The root branches contain the full authenticated app and the
        // sign-in flow, so switching them should not crossfade the whole UI.
        .background(Color(uiColor: .systemGroupedBackground))
    }

    @ViewBuilder
    private var signedOutContent: some View {
        switch model.phase {
        case .loading, .authenticated:
            HausOpeningView()
        case .signedOut:
            SignInView(
                actionTitle: model.development == nil ? "Continue with Google" : "Sign in to local Server"
            ) {
                if model.development == nil {
                    try await model.signIn()
                } else {
                    await model.signInToDevelopment()
                }
            }
        case let .failed(message):
            ContentUnavailableView {
                Label("Haus couldn't sign you in.", systemImage: "exclamationmark.triangle")
            } description: {
                VStack(spacing: 4) {
                    Text("Check your connection and try again.")
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(.tertiary)
                }
            } actions: {
                Button("Try again") { Task { await model.retry() } }
                    .buttonStyle(.borderedProminent)
            }
        }
    }
}

private struct SignInView: View {
    let actionTitle: String
    let action: @MainActor () async throws -> Void
    @State private var isSigningIn = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 22) {
            HausGhost(fill: .iridescent, animated: true, size: 56)

            VStack(spacing: 6) {
                Text("Welcome to Haus")
                    .font(.title2.weight(.semibold))
                Text("Sign in to open your team and Agents.")
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            Button(action: signIn) {
                HStack(spacing: 10) {
                    if isSigningIn { ProgressView().controlSize(.small) }
                    HausIcon(.identity, size: 20, weight: 1.8)
                    Text(actionTitle)
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(isSigningIn)

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(32)
        .frame(maxWidth: 460)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(uiColor: .systemGroupedBackground))
    }

    private func signIn() {
        Task { @MainActor in
            isSigningIn = true
            errorMessage = nil
            defer { isSigningIn = false }
            do {
                try await action()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}

/// Dismisses whatever the authenticated app presented, then runs `swap`, which
/// unmounts it. SwiftUI re-hosts a sheet whose presenter unmounts with fresh
/// state until it tears the sheet down, so `swap` runs inside UIKit's
/// completion rather than on a later run-loop turn.
@MainActor
private func dismissPresentedScreens(then swap: @escaping @MainActor () -> Void) {
    let root = UIApplication.shared.connectedScenes
        .compactMap { ($0 as? UIWindowScene)?.keyWindow?.rootViewController }
        .first
    guard let root, root.presentedViewController != nil else {
        swap()
        return
    }
    let once = RunOnce(swap)
    root.dismiss(animated: false) {
        MainActor.assumeIsolated { once.run() }
    }
    // UIKit can drop this completion if dismissal starts mid-transition.
    Task { @MainActor in
        try? await Task.sleep(for: .seconds(1))
        once.run()
    }
}

@MainActor
private final class RunOnce {
    private var action: (@MainActor () -> Void)?

    init(_ action: @escaping @MainActor () -> Void) {
        self.action = action
    }

    func run() {
        let pending = action
        action = nil
        pending?()
    }
}
