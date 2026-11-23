import Foundation

public struct WorkerCapability: Codable, Hashable, Sendable {
    public let ready: Bool
    public let accountEmail: String?
    public let reason: String?
    public let expiresAt: Date?
    public let signIn: WorkerSignIn?

    public init(
        ready: Bool,
        accountEmail: String? = nil,
        reason: String? = nil,
        expiresAt: Date? = nil,
        signIn: WorkerSignIn? = nil
    ) {
        self.ready = ready
        self.accountEmail = accountEmail
        self.reason = reason
        self.expiresAt = expiresAt
        self.signIn = signIn
    }
}

/// The Computer-owned Cursor sign-in flow projected by the Server capability
/// contract. The credential never reaches the phone; a waiting state carries only
/// the short-lived URL the phone can open in its own browser.
public enum WorkerSignIn: Hashable, Sendable {
    case waiting(url: URL, expiresAt: Date)
    case failed(message: String)

    public var isWaiting: Bool {
        if case .waiting = self { return true }
        return false
    }

    public var message: String? {
        guard case .failed(let message) = self else { return nil }
        return message
    }

    public func isExpired(at date: Date = Date()) -> Bool {
        guard case .waiting(_, let expiresAt) = self else { return false }
        return expiresAt <= date
    }
}

extension WorkerSignIn: Codable {
    private enum CodingKeys: String, CodingKey {
        case expiresAt
        case message
        case status
        case url
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let status = try container.decode(String.self, forKey: .status)
        switch status {
        case "waiting":
            let rawURL = try container.decode(String.self, forKey: .url)
            guard let url = URL(string: rawURL), Self.isTrustedCursorURL(url) else {
                throw DecodingError.dataCorruptedError(
                    forKey: .url,
                    in: container,
                    debugDescription: "Expected a trusted Cursor HTTPS sign-in URL."
                )
            }
            self = .waiting(
                url: url,
                expiresAt: try container.decode(Date.self, forKey: .expiresAt)
            )
        case "failed":
            let message = try container.decode(String.self, forKey: .message)
            guard !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                throw DecodingError.dataCorruptedError(
                    forKey: .message,
                    in: container,
                    debugDescription: "Expected a non-empty sign-in failure message."
                )
            }
            self = .failed(message: message)
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .status,
                in: container,
                debugDescription: "Unknown Cloud Agent sign-in status."
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .waiting(let url, let expiresAt):
            try container.encode("waiting", forKey: .status)
            try container.encode(url.absoluteString, forKey: .url)
            try container.encode(expiresAt, forKey: .expiresAt)
        case .failed(let message):
            try container.encode("failed", forKey: .status)
            try container.encode(message, forKey: .message)
        }
    }

    private static func isTrustedCursorURL(_ url: URL) -> Bool {
        url.scheme?.caseInsensitiveCompare("https") == .orderedSame
            && url.host?.caseInsensitiveCompare("cursor.com") == .orderedSame
            && url.port == nil
            && url.user == nil
            && url.password == nil
    }
}

