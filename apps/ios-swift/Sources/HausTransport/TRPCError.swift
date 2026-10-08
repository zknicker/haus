import Foundation

public struct TRPCError: Error, Equatable, LocalizedError, Sendable {
    public let message: String
    /// JSON-RPC error code, for example `-32600` or `-32001`.
    public let code: Int?
    /// The tRPC error data object, including the domain error code and path.
    public let data: JSONValue?
    public let httpStatus: Int?
    public let path: String?

    public init(
        message: String,
        code: Int? = nil,
        data: JSONValue? = nil,
        httpStatus: Int? = nil,
        path: String? = nil
    ) {
        self.message = message
        self.code = code
        self.data = data
        self.httpStatus = httpStatus
        self.path = path
    }

    public var errorDescription: String? {
        if let code {
            return "tRPC error \(code): \(message)"
        }
        return message
    }

    public var domainCode: String? {
        guard case let .object(data) = data else {
            return nil
        }
        return data["code"]?.stringValue
    }
}

public enum TRPCClientError: Error, Equatable, LocalizedError, Sendable {
    case invalidProcedurePath(String)
    case invalidResponse(status: Int, body: String)
    case decoding(String)
    /// The request did not complete. `urlErrorCode` is the underlying
    /// `URLError` code when there was one, so callers can tell a phone that is
    /// offline from a Server that answered badly.
    case transport(String, urlErrorCode: URLError.Code? = nil)

    public var errorDescription: String? {
        switch self {
        case let .invalidProcedurePath(path):
            return "Invalid tRPC procedure path: \(path)"
        case let .invalidResponse(status, body):
            return "Invalid tRPC response (HTTP \(status)): \(body)"
        case let .decoding(message):
            return "Unable to decode tRPC response: \(message)"
        case let .transport(message, _):
            return "tRPC transport failed: \(message)"
        }
    }

    public var isTransport: Bool {
        if case .transport = self { return true }
        return false
    }

    /// Whether the request never reached the Server because this device has no
    /// route to it: no network, a dropped link, or a host it cannot resolve or
    /// connect to. A timeout is not counted — the Server may have been slow.
    public var isNoConnection: Bool {
        guard case let .transport(_, code?) = self else { return false }
        return Self.noConnectionCodes.contains(code)
    }

    private static let noConnectionCodes: Set<URLError.Code> = [
        .notConnectedToInternet,
        .networkConnectionLost,
        .cannotFindHost,
        .cannotConnectToHost,
        .dnsLookupFailed,
        .dataNotAllowed,
        .internationalRoamingOff,
    ]
}

public struct TRPCSubscriptionOptions: Sendable, Equatable {
    public var reconnect: Bool
    public var initialRetryDelayNanoseconds: UInt64
    public var maximumRetryDelayNanoseconds: UInt64

    public init(
        reconnect: Bool = true,
        initialRetryDelayNanoseconds: UInt64 = 500_000_000,
        maximumRetryDelayNanoseconds: UInt64 = 10_000_000_000
    ) {
        self.reconnect = reconnect
        self.initialRetryDelayNanoseconds = initialRetryDelayNanoseconds
        self.maximumRetryDelayNanoseconds = maximumRetryDelayNanoseconds
    }
}

struct TRPCResponseEnvelope<Value: Decodable>: Decodable {
    let result: TRPCResultEnvelope<Value>?
    let error: TRPCErrorShape?
}

struct TRPCResultEnvelope<Value: Decodable>: Decodable {
    let data: Value?
}

struct TRPCErrorShape: Decodable {
    let message: String
    let code: Int?
    let data: JSONValue?
}
