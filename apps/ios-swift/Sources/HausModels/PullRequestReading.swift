import Foundation

public enum PullRequestSource: String, Codable, Hashable, Sendable {
    case computer
    case github
}

public struct PullRequestReading: Codable, Identifiable, Hashable, Sendable {
    public static let states: Set<String> = ["draft", "open", "merged", "closed"]
    public static let checkStates: Set<String> = ["none", "pending", "passing", "failing", "unknown"]
    public static let reviewStates: Set<String> = ["none", "approved", "changes-requested", "unknown"]

    public let number: Int
    public let repository: String
    public let state: String
    public let checks: String
    public let review: String
    public let title: String?
    public let url: String
    public let additions: Int
    public let deletions: Int
    public let changedFiles: Int
    public let observedAt: Date?
    public let settledAt: Date?
    public let headSha: String?
    public let source: PullRequestSource

    public var id: String { "\(repository)#\(number)" }

    public init(
        number: Int,
        repository: String,
        state: String,
        checks: String = "unknown",
        review: String = "unknown",
        title: String? = nil,
        url: String,
        additions: Int = 0,
        deletions: Int = 0,
        changedFiles: Int = 0,
        observedAt: Date? = nil,
        settledAt: Date? = nil,
        headSha: String? = nil,
        source: PullRequestSource = .computer
    ) {
        self.number = number
        self.repository = repository
        self.state = state
        self.checks = checks
        self.review = review
        self.title = title
        self.url = url
        self.additions = additions
        self.deletions = deletions
        self.changedFiles = changedFiles
        self.observedAt = observedAt
        self.settledAt = settledAt
        self.headSha = headSha
        self.source = source
    }

    enum CodingKeys: String, CodingKey {
        case number, repository, state, checks, review, title, url
        case additions, deletions, changedFiles, observedAt, settledAt, headSha, source
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        number = try container.decode(Int.self, forKey: .number)
        repository = try container.decode(String.self, forKey: .repository)
        state = try Self.decode(.state, in: container, from: Self.states)
        checks = try Self.decode(.checks, in: container, from: Self.checkStates)
        review = try Self.decode(.review, in: container, from: Self.reviewStates)
        title = try container.decode(String?.self, forKey: .title)
        url = try container.decode(String.self, forKey: .url)
        additions = try container.decode(Int.self, forKey: .additions)
        deletions = try container.decode(Int.self, forKey: .deletions)
        changedFiles = try container.decode(Int.self, forKey: .changedFiles)
        observedAt = try container.decode(Date.self, forKey: .observedAt)
        settledAt = try container.decode(Date?.self, forKey: .settledAt)
        headSha = try container.decode(String?.self, forKey: .headSha)
        source = try container.decode(PullRequestSource.self, forKey: .source)
    }

    private static func decode(
        _ key: CodingKeys,
        in container: KeyedDecodingContainer<CodingKeys>,
        from allowed: Set<String>
    ) throws -> String {
        let value = try container.decode(String.self, forKey: key)
        guard allowed.contains(value) else {
            throw DecodingError.dataCorruptedError(
                forKey: key, in: container, debugDescription: "Unknown pull request \(key.stringValue) \(value)."
            )
        }
        return value
    }
}
