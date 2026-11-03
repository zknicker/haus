import Foundation
@testable import HausTransport

let nativeAuthTestIssuer = URL(string: "https://thearcade.cloudflareaccess.com")!
let nativeAuthTestRedirect = URL(string: "https://haus.chat/auth/callback")!
let nativeAuthTestResource = URL(string: "https://haus.chat/auth/session")!

func nativeAuthConfigData() -> Data {
    Data(
        #"{"clientId":"ios-test-client","issuer":"https://thearcade.cloudflareaccess.com","redirectUri":"https://haus.chat/auth/callback","resource":"https://haus.chat/auth/session"}"#.utf8
    )
}

func nativeOAuthMetadataData(tokenEndpoint: String = "https://thearcade.cloudflareaccess.com/cdn-cgi/access/oauth/token") -> Data {
    Data(
        #"{"issuer":"https://thearcade.cloudflareaccess.com","authorization_endpoint":"https://thearcade.cloudflareaccess.com/cdn-cgi/access/oauth/authorization","token_endpoint":"\#(tokenEndpoint)","revocation_endpoint":"https://thearcade.cloudflareaccess.com/cdn-cgi/access/oauth/revoke","token_endpoint_auth_methods_supported":["none"],"grant_types_supported":["authorization_code","refresh_token"],"code_challenge_methods_supported":["S256"]}"#.utf8
    )
}

func nativeAppSessionData(
    accessToken: String = "haus_access_test",
    sessionToken: String = "haus_resume_test"
) -> Data {
    Data(
        #"{"session":{"accessToken":"\#(accessToken)","expiresAt":"2030-01-02T03:04:05.000Z","issuedAt":"2030-01-02T03:03:05.000Z","sessionId":"has_test","user":{"avatarId":null,"displayName":"Haus Test","email":"test@example.com","id":"usr_test"}},"sessionExpiresAt":"2030-01-02T03:04:05.000Z","sessionToken":"\#(sessionToken)"}"#.utf8
    )
}

func nativeTokenData(
    accessToken: String = "provider_access_test",
    refreshToken: String? = "provider_refresh_test",
    expiresIn: Int = 600
) -> Data {
    let refreshJSON = refreshToken.map { #""refresh_token":"\#($0)","# } ?? ""
    return Data(
        #"{"access_token":"\#(accessToken)",\#(refreshJSON)"expires_in":\#(expiresIn),"token_type":"Bearer"}"#.utf8
    )
}

func nativeFormFields(_ request: URLRequest) -> [String: String] {
    guard let body = request.httpBody ?? request.httpBodyStream.flatMap(readBody),
          let components = URLComponents(string: "?\(String(decoding: body, as: UTF8.self))")
    else { return [:] }
    return Dictionary(
        uniqueKeysWithValues: (components.queryItems ?? []).compactMap { item in
            item.value.map { (item.name, $0) }
        }
    )
}

actor MemoryNativeCredentialStore: NativeCredentialStore {
    private var value: NativeAuthCredentials?
    private var latestRevision: UInt64 = 0
    private(set) var saveCount = 0

    init(value: NativeAuthCredentials? = nil) {
        self.value = value
    }

    func load() async throws -> NativeAuthCredentials? {
        value
    }

    func advance(revision: UInt64) async throws {
        guard revision >= latestRevision else { throw NativeAuthError.sessionRequired }
        latestRevision = revision
    }

    func save(_ credentials: NativeAuthCredentials, revision: UInt64) async throws {
        guard revision >= latestRevision else { throw NativeAuthError.sessionRequired }
        latestRevision = revision
        value = credentials
        saveCount += 1
    }

    func clear(revision: UInt64) async throws {
        guard revision >= latestRevision else { return }
        latestRevision = revision
        value = nil
    }
}

actor DelayedSaveNativeCredentialStore: NativeCredentialStore {
    private var value: NativeAuthCredentials?
    private var latestRevision: UInt64 = 0
    private var pausesNextSave = false
    private var saveContinuation: CheckedContinuation<Void, Never>?
    private var pauseContinuation: CheckedContinuation<Void, Never>?
    private var hasPausedSave = false

    init(value: NativeAuthCredentials? = nil) {
        self.value = value
    }

    func load() async throws -> NativeAuthCredentials? {
        value
    }

    func advance(revision: UInt64) async throws {
        guard revision >= latestRevision else { throw NativeAuthError.sessionRequired }
        latestRevision = revision
    }

    func save(_ credentials: NativeAuthCredentials, revision: UInt64) async throws {
        guard revision >= latestRevision else { throw NativeAuthError.sessionRequired }
        latestRevision = revision
        if pausesNextSave {
            pausesNextSave = false
            await withCheckedContinuation { continuation in
                saveContinuation = continuation
                hasPausedSave = true
                pauseContinuation?.resume()
                pauseContinuation = nil
            }
            hasPausedSave = false
        }
        guard revision == latestRevision else { throw NativeAuthError.sessionRequired }
        value = credentials
    }

    func clear(revision: UInt64) async throws {
        guard revision >= latestRevision else { return }
        latestRevision = revision
        value = nil
    }

    func pauseNextSave() {
        pausesNextSave = true
    }

    func waitForPausedSave() async {
        guard !hasPausedSave else { return }
        await withCheckedContinuation { pauseContinuation = $0 }
    }

    func releasePausedSave() {
        saveContinuation?.resume()
        saveContinuation = nil
    }
}

final class TestDateClock: @unchecked Sendable {
    private let lock = NSLock()
    private var value: Date

    init(_ value: Date) {
        self.value = value
    }

    func read() -> Date {
        lock.withLock { value }
    }

    func advance(by interval: TimeInterval) {
        lock.withLock { value = value.addingTimeInterval(interval) }
    }
}
