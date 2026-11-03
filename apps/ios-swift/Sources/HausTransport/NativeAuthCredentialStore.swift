import Foundation
import Security

public protocol NativeCredentialStore: Sendable {
    func load() async throws -> NativeAuthCredentials?
    /// Fences older auth flows before their network work can finish.
    func advance(revision: UInt64) async throws
    /// `revision` is the auth epoch reserved before network work starts.
    func save(_ credentials: NativeAuthCredentials, revision: UInt64) async throws
    func clear(revision: UInt64) async throws
}

public actor KeychainNativeCredentialStore: NativeCredentialStore {
    public static let shared = KeychainNativeCredentialStore()

    private let service: String
    private let account = "credentials-v1"

    public init(service: String = "chat.haus.ios.native-auth") {
        self.service = service
    }

    public func load() async throws -> NativeAuthCredentials? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess,
              let data = result as? Data,
              let credentials = try? JSONDecoder().decode(NativeAuthCredentials.self, from: data)
        else {
            throw NativeAuthError.secureStorage
        }
        return credentials
    }

    public func save(_ credentials: NativeAuthCredentials, revision: UInt64) async throws {
        guard let data = try? JSONEncoder().encode(credentials) else {
            throw NativeAuthError.secureStorage
        }
        try KeychainCredentialCommitter.shared.save(
            data,
            service: service,
            account: account,
            revision: revision
        )
    }

    public func advance(revision: UInt64) async throws {
        try KeychainCredentialCommitter.shared.advance(
            service: service,
            account: account,
            revision: revision
        )
    }

    public func clear(revision: UInt64) async throws {
        try KeychainCredentialCommitter.shared.clear(
            service: service,
            account: account,
            revision: revision
        )
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}

private final class KeychainCredentialCommitter: @unchecked Sendable {
    static let shared = KeychainCredentialCommitter()

    private let lock = NSLock()
    private var latestRevisions: [String: UInt64] = [:]

    func save(_ data: Data, service: String, account: String, revision: UInt64) throws {
        lock.lock()
        defer { lock.unlock() }
        let record = recordKey(service: service, account: account)
        guard revision >= latestRevisions[record, default: 0] else {
            throw NativeAuthError.sessionRequired
        }
        latestRevisions[record] = revision

        let query = baseQuery(service: service, account: account)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var insert = query
            attributes.forEach { insert[$0.key] = $0.value }
            guard SecItemAdd(insert as CFDictionary, nil) == errSecSuccess else {
                throw NativeAuthError.secureStorage
            }
        } else if status != errSecSuccess {
            throw NativeAuthError.secureStorage
        }
    }

    func clear(service: String, account: String, revision: UInt64) throws {
        lock.lock()
        defer { lock.unlock() }
        let record = recordKey(service: service, account: account)
        guard revision >= latestRevisions[record, default: 0] else { return }
        latestRevisions[record] = revision

        let status = SecItemDelete(baseQuery(service: service, account: account) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw NativeAuthError.secureStorage
        }
    }

    func advance(service: String, account: String, revision: UInt64) throws {
        lock.lock()
        defer { lock.unlock() }
        let record = recordKey(service: service, account: account)
        guard revision >= latestRevisions[record, default: 0] else {
            throw NativeAuthError.sessionRequired
        }
        latestRevisions[record] = revision
    }

    private func recordKey(service: String, account: String) -> String {
        "\(service)\u{0}\(account)"
    }

    private func baseQuery(service: String, account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}

enum NativeCredentialRevision {
    private static let clock = NativeCredentialRevisionClock()

    static func next() -> UInt64 {
        clock.next()
    }
}

private final class NativeCredentialRevisionClock: @unchecked Sendable {
    private let lock = NSLock()
    private var revision: UInt64 = 0

    func next() -> UInt64 {
        lock.lock()
        defer { lock.unlock() }
        revision += 1
        return revision
    }
}
