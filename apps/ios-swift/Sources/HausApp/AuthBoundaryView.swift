import ClerkKit
import Foundation
import HausTransport
import HausUI
import SwiftUI
import UIKit

struct AuthBoundaryView: View {
    @Environment(Clerk.self) private var clerk
    /// Follows the Clerk session from `onChange` rather than `body`, so a lost
    /// session unmounts the authenticated app only once
    /// `dismissPresentedScreens(then:)` has closed its sheets.
    @State private var showsAuthenticatedApp: Bool?

    var body: some View {
        Group {
            #if DEBUG
            if let development = HausRuntimeConfiguration.development {
                DevelopmentAuthBoundaryView(development: development)
            } else {
                productionBoundary
            }
            #else
            productionBoundary
            #endif
        }
        // Deliberately no implicit animation here: its branches are the whole
        // authenticated app vs the sign-in screen, and animating that value
        // crossfaded the entire app on any session change.
    }

    private var productionBoundary: some View {
        Group {
            if showsAuthenticatedApp ?? hasUsableSession(clerk.session) {
                AuthenticatedHausView(clerk: clerk)
            } else {
                googleSignIn
            }
        }
        .onChange(of: hasUsableSession(clerk.session), initial: true) { _, usable in
            guard !usable else {
                showsAuthenticatedApp = true
                return
            }
            // A session restored while the sheet closed keeps the app mounted.
            dismissPresentedScreens { showsAuthenticatedApp = hasUsableSession(clerk.session) }
        }
    }

    private var googleSignIn: some View {
        SignInView(actionTitle: "Continue with Google") {
            _ = try await clerk.auth.signInWithOAuth(provider: .google)
        }
    }
}

#if DEBUG
private struct DevelopmentAuthBoundaryView: View {
    @Environment(Clerk.self) private var clerk
    let development: HausRuntimeConfiguration.Development

    @State private var state = DevelopmentAuthState.loading

    var body: some View {
        Group {
            switch state {
            case .loading:
                HausOpeningView()
            case .authenticated:
                AuthenticatedHausView(clerk: clerk)
            case .signedOut:
                SignInView(actionTitle: "Sign in to local Server") {
                    HausRuntimeConfiguration.clearExplicitSignOut()
                    state = .loading
                    await authenticate()
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
                    Button("Try again") {
                        state = .loading
                        Task { await authenticate() }
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .task(id: clerk.isLoaded) {
            guard clerk.isLoaded else { return }
            await authenticate()
        }
        // Losing the session while signed in is either the human's Sign Out,
        // which must not be undone by auto sign-in, or an expiry, which the
        // localhost ticket renews like a cold start.
        .onChange(of: hasUsableSession(clerk.session)) { _, usable in
            guard !usable, state == .authenticated else { return }
            dismissPresentedScreens {
                guard !hasUsableSession(clerk.session) else { return }
                if HausRuntimeConfiguration.hasExplicitlySignedOut {
                    state = .signedOut
                } else {
                    state = .loading
                    Task { await authenticate() }
                }
            }
        }
    }

    @MainActor
    private func authenticate() async {
        guard clerk.isLoaded else { return }

        do {
            if hasUsableSession(clerk.session),
               let token = try? await clerk.auth.getToken(),
               !token.isEmpty
            {
                state = .authenticated
                return
            }
            if HausRuntimeConfiguration.hasExplicitlySignedOut {
                state = .signedOut
                return
            }

            let client = TRPCClient(
                config: AppConfig(
                    serverOrigin: development.serverOrigin,
                    productVersion: Bundle.main.object(
                        forInfoDictionaryKey: "CFBundleShortVersionString"
                    ) as? String ?? "0.1.0"
                ),
                sessionTokenProvider: StaticSessionTokenProvider(token: nil)
            )
            let ticket = try await client.createDevClerkSignInTicket()
            let signIn = try await clerk.auth.signInWithTicket(ticket.ticket)
            guard let sessionID = signIn.createdSessionId else {
                throw DevSignInError.missingSession
            }
            try await clerk.auth.setActive(sessionId: sessionID)
            guard let token = try await clerk.auth.getToken(), !token.isEmpty else {
                throw DevSignInError.missingToken
            }
            state = .authenticated
        } catch {
            state = .failed("Local sign-in failed: \(error.localizedDescription)")
        }
    }
}

private enum DevelopmentAuthState: Equatable {
    case loading
    case authenticated
    case signedOut
    case failed(String)
}
#endif

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
/// state until it tears the sheet down, so swapping the root out from under
/// Settings flashed the sheet back to its top for several frames. `swap` runs
/// inside UIKit's completion, not after an `await`: the hop to a later run loop
/// turn drew the authenticated app for a frame between the two.
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
    // UIKit drops the completion of a dismiss requested mid-transition (a
    // sheet still animating in or being swiped away). Never leave the
    // authenticated app mounted on a lost session waiting for it.
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

private func hasUsableSession(_ session: Session?) -> Bool {
    guard let session else { return false }
    return session.status == .active
        && session.expireAt > Date()
        && session.abandonAt > Date()
}

private enum DevSignInError: LocalizedError {
    case missingSession
    case missingToken

    var errorDescription: String? {
        switch self {
        case .missingSession:
            "Clerk completed ticket sign-in without creating a session."
        case .missingToken:
            "Clerk activated the development session without issuing a token."
        }
    }
}
