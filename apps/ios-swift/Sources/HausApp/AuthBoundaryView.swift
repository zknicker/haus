import ClerkKit
import Foundation
import HausTransport
import HausUI
import SwiftUI

struct AuthBoundaryView: View {
    @Environment(Clerk.self) private var clerk

    var body: some View {
        Group {
            #if DEBUG
            if let development = HausRuntimeConfiguration.development {
                DevelopmentAuthBoundaryView(development: development)
            } else if hasUsableSession(clerk.session) {
                AuthenticatedHausView(clerk: clerk)
            } else {
                SignInView()
            }
            #else
            if hasUsableSession(clerk.session) {
                AuthenticatedHausView(clerk: clerk)
            } else {
                SignInView()
            }
            #endif
        }
        // Deliberately no implicit animation here: its branches are the whole
        // authenticated app vs the sign-in screen, and animating that value
        // crossfaded the entire app on any session change.
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
    case failed(String)
}
#endif

private struct SignInView: View {
    @Environment(Clerk.self) private var clerk
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
                    Text("Continue with Google")
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
                _ = try await clerk.auth.signInWithOAuth(provider: .google)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
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
