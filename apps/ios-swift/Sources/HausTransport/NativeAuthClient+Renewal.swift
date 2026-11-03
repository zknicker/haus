import Foundation

extension NativeAuthClient {
    func renewSession(forceProviderRefresh: Bool) async throws -> NativeAppSession {
        if let sessionTask, let sessionTaskID {
            let joinedGeneration = generation
            let joinedRevision = credentialRevision
            let joinedTaskWasForced = sessionTaskWasForced
            let renewed = try await sessionTask.value
            guard joinedGeneration == generation, joinedRevision == credentialRevision else {
                throw NativeAuthError.sessionRequired
            }
            if self.sessionTaskID == sessionTaskID {
                self.sessionTask = nil
                self.sessionTaskID = nil
            }
            if forceProviderRefresh && !joinedTaskWasForced {
                return try await renewSession(forceProviderRefresh: true)
            }
            return renewed
        }
        let expectedGeneration = generation
        let expectedRevision = credentialRevision
        let taskID = UUID()
        let task = Task {
            try await self.performRenewal(
                forceProviderRefresh: forceProviderRefresh,
                generation: expectedGeneration,
                revision: expectedRevision
            )
        }
        sessionTask = task
        sessionTaskID = taskID
        sessionTaskWasForced = forceProviderRefresh
        do {
            let renewed = try await task.value
            guard expectedGeneration == generation, expectedRevision == credentialRevision else {
                throw NativeAuthError.sessionRequired
            }
            if expectedGeneration == generation, expectedRevision == credentialRevision, sessionTaskID == taskID {
                sessionTask = nil
                sessionTaskID = nil
            }
            return renewed
        } catch {
            if expectedGeneration == generation, expectedRevision == credentialRevision, sessionTaskID == taskID {
                sessionTask = nil
                sessionTaskID = nil
            }
            throw error
        }
    }

    func performRenewal(
        forceProviderRefresh: Bool,
        generation expectedGeneration: Int,
        revision expectedRevision: UInt64
    ) async throws -> NativeAppSession {
        guard expectedGeneration == generation,
              expectedRevision == credentialRevision,
              !isSigningOut,
              let credentials
        else {
            throw NativeAuthError.sessionRequired
        }
        let renewed: NativeAppSession
        if isDevelopment {
            renewed = try await server.createDevelopmentSession(resumeToken: credentials.sessionToken)
        } else {
            let accessToken = try await cloudflareAccessToken(forceRefresh: forceProviderRefresh)
            guard expectedGeneration == generation, expectedRevision == credentialRevision else {
                throw NativeAuthError.sessionRequired
            }
            renewed = try await server.createSession(
                accessToken: accessToken,
                resumeToken: credentials.sessionToken
            )
        }
        try await install(renewed, generation: expectedGeneration, revision: expectedRevision)
        return renewed
    }

    func cloudflareAccessToken(forceRefresh: Bool) async throws -> String {
        guard !isSigningOut, let credentials else { throw NativeAuthError.sessionRequired }
        let expectedGeneration = generation
        let expectedRevision = credentialRevision
        if let refreshTask {
            let tokens = try await refreshTask.value
            guard expectedGeneration == generation, expectedRevision == credentialRevision else {
                throw NativeAuthError.sessionRequired
            }
            return tokens.accessToken
        }
        let accessIsFresh = credentials.cloudflareAccessToken != nil
            && (credentials.cloudflareAccessExpiresAt?.timeIntervalSince(now()) ?? 0) > 45
        let justRefreshed = lastProviderRefreshAt.map { now().timeIntervalSince($0) < 5 } ?? false
        if accessIsFresh && (!forceRefresh || justRefreshed) {
            return credentials.cloudflareAccessToken!
        }
        guard let refreshToken = credentials.cloudflareRefreshToken else {
            throw NativeAuthError.sessionRequired
        }

        let task = Task {
            try await self.performCloudflareRefresh(
                refreshToken,
                generation: expectedGeneration,
                revision: expectedRevision
            )
        }
        refreshTask = task
        do {
            let tokens = try await task.value
            guard expectedGeneration == generation, expectedRevision == credentialRevision else {
                throw NativeAuthError.sessionRequired
            }
            if expectedGeneration == generation, expectedRevision == credentialRevision { refreshTask = nil }
            return tokens.accessToken
        } catch let error as NativeAuthError where error == .invalidGrant {
            if expectedGeneration == generation, expectedRevision == credentialRevision { refreshTask = nil }
            await expireSession(expectedGeneration: expectedGeneration, revision: expectedRevision)
            throw error
        } catch {
            if expectedGeneration == generation, expectedRevision == credentialRevision { refreshTask = nil }
            throw error
        }
    }

    func performCloudflareRefresh(
        _ refreshToken: String,
        generation expectedGeneration: Int,
        revision expectedRevision: UInt64
    ) async throws -> CloudflareTokenSet {
        let provider = try await cloudflareClient()
        guard expectedGeneration == generation, expectedRevision == credentialRevision else {
            throw NativeAuthError.sessionRequired
        }
        let tokens = try await provider.refresh(refreshToken: refreshToken)
        guard expectedGeneration == generation, expectedRevision == credentialRevision else {
            throw NativeAuthError.sessionRequired
        }

        var updated = credentials ?? NativeAuthCredentials(source: .cloudflare)
        updated.cloudflareAccessToken = tokens.accessToken
        updated.cloudflareAccessExpiresAt = now().addingTimeInterval(TimeInterval(tokens.expiresIn))
        updated.cloudflareRefreshToken = tokens.refreshToken ?? refreshToken
        try await persist(updated, generation: expectedGeneration, revision: expectedRevision)
        lastProviderRefreshAt = now()
        return tokens
    }

    func install(
        _ nativeSession: NativeAppSession,
        generation expectedGeneration: Int,
        revision expectedRevision: UInt64
    ) async throws {
        guard expectedGeneration == generation,
              expectedRevision == credentialRevision,
              let accessExpiration = nativeSession.session.expirationDate,
              let resumeExpiration = nativeSession.resumeExpirationDate,
              accessExpiration > now(), resumeExpiration > now()
        else { throw NativeAuthError.sessionRequired }

        var updated = credentials ?? NativeAuthCredentials(source: isDevelopment ? .development : .cloudflare)
        updated.sessionToken = nativeSession.sessionToken
        updated.sessionExpiresAt = nativeSession.sessionExpiresAt
        try await persist(updated, generation: expectedGeneration, revision: expectedRevision)
        credentials = updated
        appSession = nativeSession
        publish(.authenticated(nativeSession.session))
        scheduleMaintenance()
    }

    func persist(_ value: NativeAuthCredentials, generation expectedGeneration: Int, revision expectedRevision: UInt64) async throws {
        guard expectedGeneration == generation, expectedRevision == credentialRevision else {
            throw NativeAuthError.sessionRequired
        }
        try await credentialStore.save(value, revision: expectedRevision)
        guard expectedGeneration == generation, expectedRevision == credentialRevision else {
            throw NativeAuthError.sessionRequired
        }
        credentials = value
    }

    func cloudflareClient() async throws -> CloudflareOAuthClient {
        if let oauth { return oauth }
        return try await discoverOAuthClient()
    }

    func discoverOAuthClient() async throws -> CloudflareOAuthClient {
        let config = try await server.loadConfig()
        let discovered = try await CloudflareOAuthClient.discover(config: config, session: session)
        oauth = discovered
        return discovered
    }

    func expireSession(expectedGeneration: Int, revision expectedRevision: UInt64) async {
        guard expectedGeneration == generation, expectedRevision == credentialRevision else { return }
        generation += 1
        invalidateInFlightWork()
        credentials = nil
        appSession = nil
        pendingOAuth = nil
        try? await credentialStore.clear(revision: expectedRevision)
        publish(.signedOut)
    }

    func clearCredentials(generation expectedGeneration: Int, revision expectedRevision: UInt64) async throws {
        guard expectedGeneration == generation, expectedRevision == credentialRevision else {
            throw NativeAuthError.sessionRequired
        }
        credentials = nil
        try await credentialStore.clear(revision: expectedRevision)
        guard expectedGeneration == generation, expectedRevision == credentialRevision else {
            throw NativeAuthError.sessionRequired
        }
    }

    func scheduleMaintenance() {
        maintenanceTask?.cancel()
        guard let expiration = appSession?.session.expirationDate else { return }
        let expectedGeneration = generation
        let expectedRevision = credentialRevision
        let delay = max(1, expiration.timeIntervalSince(now()) - 25)
        maintenanceTask = Task { [weak self] in
            do {
                try await Task.sleep(for: .seconds(delay))
            } catch {
                return
            }
            await self?.maintainSession(generation: expectedGeneration, revision: expectedRevision)
        }
    }

    func maintainSession(generation expectedGeneration: Int, revision expectedRevision: UInt64) async {
        guard expectedGeneration == generation, expectedRevision == credentialRevision else { return }
        do {
            _ = try await renewSession(forceProviderRefresh: false)
        } catch let error as NativeAuthError where error.requiresSignIn {
            await expireSession(expectedGeneration: expectedGeneration, revision: expectedRevision)
        } catch {
            guard expectedGeneration == generation, expectedRevision == credentialRevision else { return }
            let delay = max(1, min(10, (appSession?.session.expirationDate?.timeIntervalSince(now()) ?? 1) / 2))
            maintenanceTask = Task { [weak self] in
                do { try await Task.sleep(for: .seconds(delay)) } catch { return }
                await self?.maintainSession(generation: expectedGeneration, revision: expectedRevision)
            }
        }
    }

    func validateServerOrigin() throws {
        guard let scheme = serverOrigin.scheme,
              let host = serverOrigin.host,
              serverOrigin.user == nil,
              serverOrigin.password == nil,
              serverOrigin.query == nil,
              serverOrigin.fragment == nil,
              serverOrigin.path.isEmpty || serverOrigin.path == "/"
        else { throw NativeAuthError.invalidConfiguration }
        if isDevelopment {
            guard scheme == "http", ["localhost", "127.0.0.1", "::1"].contains(host) else {
                throw NativeAuthError.invalidConfiguration
            }
        } else if scheme != "https" || host != "haus.chat" || serverOrigin.port != nil {
            throw NativeAuthError.invalidConfiguration
        }
    }

    func isTrustedStartURL(_ url: URL) -> Bool {
        url.scheme == serverOrigin.scheme && url.host == serverOrigin.host
            && url.port == serverOrigin.port && url.path == "/auth/start"
            && url.user == nil && url.password == nil && url.fragment == nil
    }

    func endpoint(_ path: String) -> URL {
        path.split(separator: "/").reduce(serverOrigin) { url, component in
            url.appendingPathComponent(String(component), isDirectory: false)
        }
    }

    func invalidateInFlightWork() {
        refreshTask?.cancel()
        refreshTask = nil
        sessionTask?.cancel()
        sessionTask = nil
        sessionTaskID = nil
        sessionTaskWasForced = false
        maintenanceTask?.cancel()
        maintenanceTask = nil
    }

    func publish(_ event: NativeAuthEvent) {
        observers.values.forEach { $0.yield(event) }
    }

    func removeObserver(_ id: UUID) {
        observers[id] = nil
    }
}
