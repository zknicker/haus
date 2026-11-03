import Foundation
import HausTransport
import Observation

@MainActor
@Observable
final class AuthBoundaryModel {
    enum Phase: Equatable {
        case loading
        case signedOut
        case authenticated(AppSession)
        case failed(String)
    }

    let authClient: NativeAuthClient
    let development: HausRuntimeConfiguration.Development?
    private(set) var phase = Phase.loading
    private var didStart = false
    private var eventTask: Task<Void, Never>?
    private var activeWebAuthentication: NativeWebAuthenticationSession?

    init() {
        development = HausRuntimeConfiguration.development
        authClient = NativeAuthClient(
            serverOrigin: development?.serverOrigin ?? HausRuntimeConfiguration.serverOrigin,
            development: development != nil
        )
    }

    func start() async {
        guard !didStart else { return }
        didStart = true
        let updates = await authClient.statusUpdates()
        eventTask = Task { @MainActor [weak self] in
            for await event in updates {
                guard let self else { return }
                receive(event)
            }
        }
        await restore()
    }

    func retry() async {
        await restore()
    }

    func restore() async {
        phase = .loading
        do {
            if let session = try await authClient.restoreSession() {
                phase = .authenticated(session)
                return
            }
            if development != nil, !HausRuntimeConfiguration.hasExplicitlySignedOut {
                let session = try await authClient.createDevelopmentSession()
                phase = .authenticated(session)
                return
            }
            phase = .signedOut
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    func signIn() async throws {
        do {
            let request = try await authClient.beginAuthorization()
            let webAuthentication = NativeWebAuthenticationSession()
            activeWebAuthentication = webAuthentication
            defer { activeWebAuthentication = nil }
            let callbackURL = try await webAuthentication.authenticate(request)
            let session = try await authClient.completeAuthorization(callbackURL: callbackURL)
            phase = .authenticated(session)
        } catch {
            await authClient.cancelAuthorization()
            phase = .signedOut
            throw error
        }
    }

    func signInToDevelopment() async {
        HausRuntimeConfiguration.clearExplicitSignOut()
        await restore()
    }

    func refreshSession() async {
        do {
            try await authClient.refreshIfNeeded()
        } catch {
            // The auth client publishes terminal failures and retries temporary
            // network errors through its scheduled maintenance task.
        }
    }

    private func receive(_ event: NativeAuthEvent) {
        switch event {
        case let .authenticated(session):
            phase = .authenticated(session)
        case .signedOut:
            phase = .signedOut
        }
    }
}
