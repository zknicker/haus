import Foundation

public actor NativeAuthClient {
    let serverOrigin: URL
    let isDevelopment: Bool
    let credentialStore: any NativeCredentialStore
    let session: URLSession
    let server: NativeAuthServerAPI
    let now: @Sendable () -> Date

    var credentials: NativeAuthCredentials?
    var appSession: NativeAppSession?
    var oauth: CloudflareOAuthClient?
    var pendingOAuth: NativeOAuthTransaction?
    var generation = 0
    var credentialRevision: UInt64 = 0
    var lastProviderRefreshAt: Date?
    var refreshTask: Task<CloudflareTokenSet, Error>?
    var sessionTask: Task<NativeAppSession, Error>?
    var sessionTaskID: UUID?
    var sessionTaskWasForced = false
    var isSigningOut = false
    var maintenanceTask: Task<Void, Never>?
    var observers: [UUID: AsyncStream<NativeAuthEvent>.Continuation] = [:]

    public init(
        serverOrigin: URL,
        development: Bool = false,
        credentialStore: any NativeCredentialStore = KeychainNativeCredentialStore.shared,
        session: URLSession? = nil,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.serverOrigin = serverOrigin
        isDevelopment = development
        self.credentialStore = credentialStore
        let networkSession = session ?? NativeAuthHTTP.makeSession()
        self.session = networkSession
        server = NativeAuthServerAPI(serverOrigin: serverOrigin, session: networkSession)
        self.now = now
    }

    public func statusUpdates() -> AsyncStream<NativeAuthEvent> {
        let id = UUID()
        return AsyncStream { continuation in
            observers[id] = continuation
            if let appSession { continuation.yield(.authenticated(appSession.session)) }
            continuation.onTermination = { @Sendable _ in
                Task { await self.removeObserver(id) }
            }
        }
    }

    public func restoreSession() async throws -> AppSession? {
        guard !isSigningOut else { throw NativeAuthError.sessionRequired }
        try validateServerOrigin()
        generation += 1
        let expectedRevision = reserveCredentialRevision()
        invalidateInFlightWork()
        let expectedGeneration = generation
        appSession = nil
        try await credentialStore.advance(revision: expectedRevision)
        guard expectedGeneration == generation, expectedRevision == credentialRevision else {
            throw NativeAuthError.sessionRequired
        }
        let storedCredentials = try await credentialStore.load()
        guard expectedGeneration == generation, expectedRevision == credentialRevision else {
            throw NativeAuthError.sessionRequired
        }
        credentials = storedCredentials

        guard let stored = credentials else { return nil }
        let expectedSource: NativeAuthCredentials.Source = isDevelopment ? .development : .cloudflare
        guard stored.source == expectedSource else {
            try await clearCredentials(generation: expectedGeneration, revision: expectedRevision)
            return nil
        }
        if isDevelopment, stored.sessionToken == nil {
            try await clearCredentials(generation: expectedGeneration, revision: expectedRevision)
            return nil
        }
        if !isDevelopment, stored.cloudflareRefreshToken == nil {
            try await clearCredentials(generation: expectedGeneration, revision: expectedRevision)
            return nil
        }

        do {
            let restored = try await renewSession(forceProviderRefresh: false)
            return restored.session
        } catch let error as NativeAuthError where error.requiresSignIn {
            await expireSession(expectedGeneration: expectedGeneration, revision: expectedRevision)
            return nil
        }
    }

    public func createDevelopmentSession() async throws -> AppSession {
        guard isDevelopment, !isSigningOut else { throw NativeAuthError.invalidConfiguration }
        try validateServerOrigin()
        generation += 1
        let expectedRevision = reserveCredentialRevision()
        invalidateInFlightWork()
        let expectedGeneration = generation
        pendingOAuth = nil
        try await credentialStore.advance(revision: expectedRevision)
        guard expectedGeneration == generation, expectedRevision == credentialRevision else {
            throw NativeAuthError.sessionRequired
        }
        let created = try await server.createDevelopmentSession(resumeToken: nil)
        try await install(created, generation: expectedGeneration, revision: expectedRevision)
        return created.session
    }

    public func beginAuthorization(switchAccount: Bool = false) async throws -> NativeAuthorizationRequest {
        guard !isSigningOut else { throw NativeAuthError.sessionRequired }
        guard !isDevelopment else { throw NativeAuthError.invalidConfiguration }
        try validateServerOrigin()
        generation += 1
        let expectedRevision = reserveCredentialRevision()
        invalidateInFlightWork()
        let expectedGeneration = generation
        pendingOAuth = nil
        appSession = nil
        try await credentialStore.advance(revision: expectedRevision)
        guard expectedGeneration == generation, expectedRevision == credentialRevision else {
            throw NativeAuthError.sessionRequired
        }

        let config = try await server.loadConfig()
        guard expectedGeneration == generation, expectedRevision == credentialRevision else {
            throw NativeAuthError.sessionRequired
        }
        let oauthClient = try await CloudflareOAuthClient.discover(config: config, session: session)
        guard expectedGeneration == generation, expectedRevision == credentialRevision else {
            throw NativeAuthError.sessionRequired
        }
        let pkce = try NativePKCEChallenge.create()
        var components = URLComponents(url: endpoint(NativeAuthConstants.authStartPath), resolvingAgainstBaseURL: false)
        var queryItems = [
            URLQueryItem(name: "client", value: "ios"),
            URLQueryItem(name: "redirectUri", value: NativeAuthConstants.callbackURL.absoluteString),
            URLQueryItem(name: "state", value: pkce.state),
            URLQueryItem(name: "codeChallenge", value: pkce.challenge),
        ]
        if switchAccount { queryItems.append(URLQueryItem(name: "switchAccount", value: "true")) }
        components?.queryItems = queryItems
        guard let url = components?.url, isTrustedStartURL(url) else {
            throw NativeAuthError.invalidConfiguration
        }
        guard expectedGeneration == generation, expectedRevision == credentialRevision, pendingOAuth == nil else {
            throw NativeAuthError.sessionRequired
        }

        oauth = oauthClient
        pendingOAuth = NativeOAuthTransaction(
            state: pkce.state,
            verifier: pkce.verifier,
            generation: expectedGeneration,
            revision: expectedRevision,
            oauth: oauthClient
        )
        return NativeAuthorizationRequest(url: url, callbackScheme: NativeAuthConstants.callbackScheme)
    }

    public func completeAuthorization(callbackURL: URL) async throws -> AppSession {
        guard let transaction = pendingOAuth,
              transaction.generation == generation,
              transaction.revision == credentialRevision
        else {
            throw NativeAuthError.invalidCallback
        }
        pendingOAuth = nil
        let expectedGeneration = generation
        let expectedRevision = transaction.revision
        let code = try NativeOAuthCallback.code(from: callbackURL, expectedState: transaction.state)
        let tokens = try await transaction.oauth.exchange(code: code, verifier: transaction.verifier)
        guard expectedGeneration == generation, expectedRevision == credentialRevision else {
            throw NativeAuthError.sessionRequired
        }
        guard let refreshToken = tokens.refreshToken, !refreshToken.isEmpty else {
            throw NativeAuthError.invalidResponse
        }

        var newCredentials = NativeAuthCredentials(source: .cloudflare)
        newCredentials.cloudflareAccessToken = tokens.accessToken
        newCredentials.cloudflareAccessExpiresAt = now().addingTimeInterval(TimeInterval(tokens.expiresIn))
        newCredentials.cloudflareRefreshToken = refreshToken
        try await persist(newCredentials, generation: expectedGeneration, revision: expectedRevision)

        do {
            let created = try await server.createSession(accessToken: tokens.accessToken, resumeToken: nil)
            try await install(created, generation: expectedGeneration, revision: expectedRevision)
            return created.session
        } catch let error as NativeAuthError where error.requiresSignIn {
            await expireSession(expectedGeneration: expectedGeneration, revision: expectedRevision)
            throw error
        }
    }

    public func cancelAuthorization() async {
        generation += 1
        let revision = reserveCredentialRevision()
        pendingOAuth = nil
        invalidateInFlightWork()
        try? await credentialStore.advance(revision: revision)
    }

    public func readAccessToken() async throws -> String {
        guard !isSigningOut else { throw NativeAuthError.sessionRequired }
        guard let active = appSession else { throw NativeAuthError.sessionRequired }
        guard let expiration = active.session.expirationDate else { throw NativeAuthError.invalidResponse }
        if expiration.timeIntervalSince(now()) > 20 { return active.session.accessToken }
        let expectedGeneration = generation
        let expectedRevision = credentialRevision
        do {
            return try await renewSession(forceProviderRefresh: false).session.accessToken
        } catch let error as NativeAuthError where error.requiresSignIn {
            await expireSession(expectedGeneration: expectedGeneration, revision: expectedRevision)
            throw error
        }
    }

    public func refreshAfterUnauthorized() async throws {
        let expectedGeneration = generation
        let expectedRevision = credentialRevision
        do {
            _ = try await renewSession(forceProviderRefresh: true)
        } catch let error as NativeAuthError where error.requiresSignIn {
            await expireSession(expectedGeneration: expectedGeneration, revision: expectedRevision)
            throw error
        }
    }

    public func refreshIfNeeded() async throws {
        _ = try await readAccessToken()
    }

    public func signOut() async throws {
        let previous = credentials
        let previousSession = appSession
        let currentOAuth = oauth
        generation += 1
        let revision = reserveCredentialRevision()
        invalidateInFlightWork()
        isSigningOut = true
        pendingOAuth = nil
        oauth = nil
        do {
            try await credentialStore.clear(revision: revision)
        } catch {
            isSigningOut = false
            credentials = previous
            appSession = previousSession
            oauth = currentOAuth
            scheduleMaintenance()
            throw error
        }
        credentials = nil
        appSession = nil
        isSigningOut = false
        publish(.signedOut)

        let server = self.server
        let session = self.session
        Task {
            if let resumeToken = previous?.sessionToken {
                try? await server.logout(resumeToken: resumeToken)
            }
            guard let refreshToken = previous?.cloudflareRefreshToken,
                  previous?.source == .cloudflare
            else { return }
            do {
                let provider: CloudflareOAuthClient
                if let currentOAuth {
                    provider = currentOAuth
                } else {
                    let config = try await server.loadConfig()
                    provider = try await CloudflareOAuthClient.discover(config: config, session: session)
                }
                try await provider.revoke(refreshToken: refreshToken)
            } catch {
                // Local sign-out already removed every reusable credential.
            }
        }
    }

    func reserveCredentialRevision() -> UInt64 {
        let revision = NativeCredentialRevision.next()
        credentialRevision = revision
        return revision
    }

}
