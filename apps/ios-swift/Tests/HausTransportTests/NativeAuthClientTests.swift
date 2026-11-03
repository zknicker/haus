import Foundation
import XCTest
@testable import HausTransport

final class NativeAuthClientTests: XCTestCase {
    override func tearDown() {
        StubURLProtocol.requestHandler = nil
        super.tearDown()
    }

    func testDevelopmentSessionUsesLocalFixtureAndPersistsResumeToken() async throws {
        let store = MemoryNativeCredentialStore()
        StubURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.absoluteString, "http://localhost:46051/auth/dev/session")
            XCTAssertNil(request.value(forHTTPHeaderField: "authorization"))
            let body = try XCTUnwrap(request.httpBody ?? request.httpBodyStream.flatMap(readBody))
            let object = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            XCTAssertEqual(object["client"] as? String, "ios")
            XCTAssertNil(object["sessionToken"])
            return response(data: nativeAppSessionData(), url: request.url)
        }
        let client = NativeAuthClient(
            serverOrigin: URL(string: "http://localhost:46051")!,
            development: true,
            credentialStore: store,
            session: makeStubSession()
        )

        let session = try await client.createDevelopmentSession()
        let stored = try await store.load()

        XCTAssertEqual(session.user.id, "usr_test")
        XCTAssertEqual(session.accessToken, "haus_access_test")
        XCTAssertEqual(stored?.source, .development)
        XCTAssertEqual(stored?.sessionToken, "haus_resume_test")
        XCTAssertNil(stored?.cloudflareRefreshToken)
    }

    func testDevelopmentSessionRejectsPublicServerOrigins() async throws {
        let client = NativeAuthClient(
            serverOrigin: URL(string: "http://example.com")!,
            development: true,
            credentialStore: MemoryNativeCredentialStore(),
            session: makeStubSession()
        )

        do {
            _ = try await client.createDevelopmentSession()
            XCTFail("Expected a non-loopback development origin to be rejected")
        } catch let error as NativeAuthError {
            XCTAssertEqual(error, .invalidConfiguration)
        }
    }

    func testRestoreUsesExistingResumeTokenAndRejectsWrongCredentialSource() async throws {
        var saved = NativeAuthCredentials(source: .development)
        saved.sessionToken = "resume_before"
        let store = MemoryNativeCredentialStore(value: saved)
        StubURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.url?.path, "/auth/dev/session")
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertNil(request.value(forHTTPHeaderField: "authorization"))
            let object = try XCTUnwrap(
                JSONSerialization.jsonObject(with: request.httpBody ?? request.httpBodyStream.flatMap(readBody) ?? Data()) as? [String: Any]
            )
            XCTAssertEqual(object["client"] as? String, "ios")
            XCTAssertEqual(object["sessionToken"] as? String, "resume_before")
            return response(
                data: nativeAppSessionData(accessToken: "haus_access_new", sessionToken: "resume_after"),
                url: request.url
            )
        }
        let client = NativeAuthClient(
            serverOrigin: URL(string: "http://127.0.0.1:46051")!,
            development: true,
            credentialStore: store,
            session: makeStubSession()
        )

        let restored = try await client.restoreSession()
        XCTAssertEqual(restored?.accessToken, "haus_access_new")
        let updated = try await store.load()
        XCTAssertEqual(updated?.sessionToken, "resume_after")

        var wrongSource = NativeAuthCredentials(source: .cloudflare)
        wrongSource.cloudflareRefreshToken = "old_provider_token"
        let wrongSourceStore = MemoryNativeCredentialStore(value: wrongSource)
        let newClient = NativeAuthClient(
            serverOrigin: URL(string: "http://localhost:46051")!,
            development: true,
            credentialStore: wrongSourceStore,
            session: makeStubSession()
        )
        StubURLProtocol.requestHandler = { _ in
            XCTFail("A credential from another auth source should not be used")
            return response(data: Data(), url: URL(string: "http://localhost:46051/auth/dev/session")!)
        }

        let noSession = try await newClient.restoreSession()
        let cleared = try await wrongSourceStore.load()
        XCTAssertNil(noSession)
        XCTAssertNil(cleared)
    }

    func testConcurrentProviderRefreshPersistsRotatedTokenBeforeReturning() async throws {
        let start = Date(timeIntervalSince1970: 1_800_000_000)
        let clock = TestDateClock(start)
        var initial = NativeAuthCredentials(source: .cloudflare)
        initial.cloudflareAccessToken = "provider_access_old"
        initial.cloudflareAccessExpiresAt = start.addingTimeInterval(600)
        initial.cloudflareRefreshToken = "provider_refresh_old"
        initial.sessionToken = "haus_resume_old"
        let store = MemoryNativeCredentialStore(value: initial)
        var refreshRequestCount = 0
        StubURLProtocol.requestHandler = { request in
            switch request.url?.path {
            case "/auth/session":
                XCTAssertEqual(request.value(forHTTPHeaderField: "authorization"), "Bearer provider_access_old")
                let object = try XCTUnwrap(
                    JSONSerialization.jsonObject(with: request.httpBody ?? request.httpBodyStream.flatMap(readBody) ?? Data()) as? [String: Any]
                )
                XCTAssertEqual(object["client"] as? String, "ios")
                XCTAssertEqual(object["sessionToken"] as? String, "haus_resume_old")
                return response(data: nativeAppSessionData(sessionToken: "haus_resume_next"), url: request.url)
            case "/auth/config":
                return response(data: nativeAuthConfigData(), url: request.url)
            case "/.well-known/oauth-authorization-server":
                return response(data: nativeOAuthMetadataData(), url: request.url)
            case "/cdn-cgi/access/oauth/token":
                refreshRequestCount += 1
                let fields = nativeFormFields(request)
                XCTAssertEqual(fields["grant_type"], "refresh_token")
                XCTAssertEqual(fields["refresh_token"], "provider_refresh_old")
                XCTAssertEqual(fields["client_id"], "ios-test-client")
                XCTAssertEqual(fields["resource"], "https://haus.chat/auth/session")
                Thread.sleep(forTimeInterval: 0.1)
                return response(
                    data: nativeTokenData(accessToken: "provider_access_new", refreshToken: "provider_refresh_rotated"),
                    url: request.url
                )
            default:
                XCTFail("Unexpected auth request: \(request.url?.absoluteString ?? "nil")")
                return response(data: Data(), url: request.url)
            }
        }
        let client = NativeAuthClient(
            serverOrigin: URL(string: "https://haus.chat")!,
            credentialStore: store,
            session: makeStubSession(),
            now: { clock.read() }
        )

        _ = try await client.restoreSession()
        clock.advance(by: 700)
        async let first = client.cloudflareAccessToken(forceRefresh: true)
        async let second = client.cloudflareAccessToken(forceRefresh: true)
        let values = try await (first, second)
        let persisted = try await store.load()

        XCTAssertEqual(values.0, "provider_access_new")
        XCTAssertEqual(values.1, "provider_access_new")
        XCTAssertEqual(refreshRequestCount, 1)
        XCTAssertEqual(persisted?.cloudflareRefreshToken, "provider_refresh_rotated")
        XCTAssertEqual(persisted?.cloudflareAccessToken, "provider_access_new")
    }

    func testSignOutCannotBeUndoneByAnInFlightCredentialSave() async throws {
        let start = Date(timeIntervalSince1970: 1_800_000_000)
        let clock = TestDateClock(start)
        var initial = NativeAuthCredentials(source: .cloudflare)
        initial.cloudflareAccessToken = "provider_access_old"
        initial.cloudflareAccessExpiresAt = start.addingTimeInterval(600)
        initial.cloudflareRefreshToken = "provider_refresh_old"
        initial.sessionToken = "haus_resume_old"
        let store = DelayedSaveNativeCredentialStore(value: initial)
        StubURLProtocol.requestHandler = { request in
            switch request.url?.path {
            case "/auth/session":
                if request.value(forHTTPHeaderField: "authorization") == "Bearer provider_access_login" {
                    return response(
                        data: nativeAppSessionData(accessToken: "haus_access_login", sessionToken: "haus_resume_login"),
                        url: request.url
                    )
                }
                return response(data: nativeAppSessionData(), url: request.url)
            case "/auth/config":
                return response(data: nativeAuthConfigData(), url: request.url)
            case "/.well-known/oauth-authorization-server":
                return response(data: nativeOAuthMetadataData(), url: request.url)
            case "/cdn-cgi/access/oauth/token":
                let fields = nativeFormFields(request)
                if fields["grant_type"] == "authorization_code" {
                    XCTAssertEqual(fields["code"], "login_code")
                    return response(
                        data: nativeTokenData(accessToken: "provider_access_login", refreshToken: "provider_refresh_login"),
                        url: request.url
                    )
                }
                return response(
                    data: nativeTokenData(accessToken: "provider_access_new", refreshToken: "provider_refresh_rotated"),
                    url: request.url
                )
            case "/auth/logout", "/cdn-cgi/access/oauth/revoke":
                return response(data: Data(), url: request.url)
            default:
                XCTFail("Unexpected auth request: \(request.url?.absoluteString ?? "nil")")
                return response(data: Data(), url: request.url)
            }
        }
        let oldClient = NativeAuthClient(
            serverOrigin: URL(string: "https://haus.chat")!,
            credentialStore: store,
            session: makeStubSession(),
            now: { clock.read() }
        )

        _ = try await oldClient.restoreSession()
        await store.pauseNextSave()
        clock.advance(by: 700)
        let refresh = Task { try await oldClient.cloudflareAccessToken(forceRefresh: true) }
        await store.waitForPausedSave()

        try await oldClient.signOut()
        let credentialsAfterSignOut = try await store.load()
        XCTAssertNil(credentialsAfterSignOut)

        let newClient = NativeAuthClient(
            serverOrigin: URL(string: "https://haus.chat")!,
            credentialStore: store,
            session: makeStubSession(),
            now: { clock.read() }
        )
        let request = try await newClient.beginAuthorization()
        let state = try XCTUnwrap(
            URLComponents(url: request.url, resolvingAgainstBaseURL: false)?.queryItems?
                .first(where: { $0.name == "state" })?.value
        )
        let callback = try XCTUnwrap(URL(string: "haus://sso-callback?code=login_code&state=\(state)"))
        let login = try await newClient.completeAuthorization(callbackURL: callback)
        XCTAssertEqual(login.accessToken, "haus_access_login")

        await store.releasePausedSave()
        if case .success = await refresh.result {
            XCTFail("A refresh invalidated by sign-out should not return credentials")
        }

        let credentialsAfterDelayedSave = try await store.load()
        XCTAssertEqual(credentialsAfterDelayedSave?.cloudflareAccessToken, "provider_access_login")
        XCTAssertEqual(credentialsAfterDelayedSave?.cloudflareRefreshToken, "provider_refresh_login")
        XCTAssertEqual(credentialsAfterDelayedSave?.sessionToken, "haus_resume_login")
    }

    func testKeychainRevisionFenceIsSharedAcrossStoreInstances() async throws {
        let service = "chat.haus.tests.native-auth-\(UUID().uuidString)"
        let oldStore = KeychainNativeCredentialStore(service: service)
        let newStore = KeychainNativeCredentialStore(service: service)
        var oldCredentials = NativeAuthCredentials(source: .cloudflare)
        oldCredentials.cloudflareRefreshToken = "old_refresh"
        var newCredentials = NativeAuthCredentials(source: .cloudflare)
        newCredentials.cloudflareRefreshToken = "new_refresh"
        let oldRevision = NativeCredentialRevision.next()
        let newRevision = NativeCredentialRevision.next()

        try await oldStore.advance(revision: oldRevision)
        try await newStore.advance(revision: newRevision)
        try await newStore.save(newCredentials, revision: newRevision)
        do {
            try await oldStore.save(oldCredentials, revision: oldRevision)
            XCTFail("A write from an older store instance should be rejected")
        } catch let error as NativeAuthError {
            XCTAssertEqual(error, .sessionRequired)
        }
        try await oldStore.clear(revision: oldRevision)

        let stored = try await newStore.load()
        XCTAssertEqual(stored?.cloudflareRefreshToken, "new_refresh")
        try await newStore.clear(revision: NativeCredentialRevision.next())
    }
}
