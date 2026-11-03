/// Supplies the current Haus AppSession access token for a request.
///
/// The provider is queried for every operation so a renewed Haus session is
/// used without recreating the transport client.
public protocol SessionTokenProvider: Sendable {
    /// Matches the existing App client's token-reader contract.
    func readSessionToken() async throws -> String?
}

public extension SessionTokenProvider {
    /// Short native spelling for call sites that do not need the legacy name.
    func sessionToken() async throws -> String? {
        try await readSessionToken()
    }
}

public struct StaticSessionTokenProvider: SessionTokenProvider, Sendable {
    private let token: String?

    public init(token: String?) {
        self.token = token
    }

    public func readSessionToken() async throws -> String? {
        token
    }
}

public struct ClosureSessionTokenProvider: SessionTokenProvider, Sendable {
    private let read: @Sendable () async throws -> String?

    public init(read: @escaping @Sendable () async throws -> String?) {
        self.read = read
    }

    public func readSessionToken() async throws -> String? {
        try await read()
    }
}
