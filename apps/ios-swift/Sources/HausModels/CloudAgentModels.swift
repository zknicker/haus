import Foundation

public enum CloudAgentStatus: String, Codable, Hashable, Sendable {
    case pendingInput = "pending_input"
    case queued, running, completed, failed, cancelled, expired

    public var isActive: Bool { self == .queued || self == .running || self == .pendingInput }
}

public struct CloudAgentWork: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let agentId: String
    public let chatId: String
    public let messageId: String
    public let provider: String
    public let providerUrl: String?
    public let repository: String
    public let startingRef: String?
    public let title: String
    public let status: CloudAgentStatus
    public let createdAt: Date
    public let updatedAt: Date
    public let startedAt: Date?
    public let terminalAt: Date?
    public let cancelRequestedAt: Date?
    public let activity: CloudAgentActivity?
    /// The Server's reading of the whole job across its Runs (`deriveCloudAgentJob`).
    public let job: CloudAgentJob
    public let runs: [CloudAgentRun]
}

public struct CloudAgentActivity: Codable, Hashable, Sendable {
    public let at: Date
    public let summary: String
}

public struct CloudAgentRun: Codable, Hashable, Sendable {
    public let runId: String
    public let status: CloudAgentStatus
    /// When the Run was queued: the job's start, or when a follow-up was sent.
    public let createdAt: Date
    public let branches: [CloudAgentBranch]
    public let startedAt: Date?
    public let terminalAt: Date?
    public let summary: String?
    public let errorCode: String?
    /// Nil only for a Server older than the model contract.
    public let model: CloudAgentRunModel?
}

public struct CloudAgentBranch: Codable, Hashable, Sendable {
    public let branch: String
    public let repository: String
    public let pullRequestUrl: String?
    public let pullRequest: CloudAgentPullRequest?
}

public struct CloudAgentPullRequest: Codable, Hashable, Sendable {
    public let additions: Int
    public let changedFiles: Int
    public let deletions: Int
    public let number: Int
    public let state: String
    public let observedAt: Date
}

public struct ThreadCloudAgentWork: Codable, Hashable, Sendable {
    public let anchorMessageId: String
    public let work: CloudAgentWork

    /// The Chats whose loaded work list names any of the work, so a change
    /// reaches every Chat that links it rather than only the one an event named.
    public static func chatIDs(
        listing workIDs: Set<String>,
        in lists: [String: [ThreadCloudAgentWork]]
    ) -> Set<String> {
        guard !workIDs.isEmpty else { return [] }
        return Set(lists.compactMap { chatID, rows in
            rows.contains { workIDs.contains($0.work.id) } ? chatID : nil
        })
    }
}

public struct CloudAgentCapability: Codable, Hashable, Sendable {
    public let ready: Bool
    public let accountEmail: String?
    public let reason: String?
    public let expiresAt: Date?
    public let signIn: CloudAgentSignIn?

    public init(
        ready: Bool,
        accountEmail: String? = nil,
        reason: String? = nil,
        expiresAt: Date? = nil,
        signIn: CloudAgentSignIn? = nil
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
public enum CloudAgentSignIn: Hashable, Sendable {
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

extension CloudAgentSignIn: Codable {
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

