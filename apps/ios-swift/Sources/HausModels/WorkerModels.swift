import Foundation

public enum WorkerTurnStatus: String, Codable, Hashable, Sendable {
    case queued, running, completed, failed, cancelled, expired
    case pendingInput = "pending_input"

    public var isActive: Bool { self == .queued || self == .running }
}

public enum WorkerStatus: String, Codable, CaseIterable, Hashable, Sendable {
    case queued, working, done, failed, stopped
    case needsYou = "needs-you"
}

public enum WorkerRuntime: String, Codable, CaseIterable, Hashable, Sendable {
    case claudeCode = "claude-code"
    case codex
}

public struct Worker: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let agentId: String
    /// The Task the Worker belongs to; nil only on read-only history.
    public let taskId: String?
    public let place: WorkerPlace
    public let providerUrl: String?
    public let repository: String
    public let startingRef: String?
    public let title: String
    public let createdAt: Date
    public let updatedAt: Date
    public let startedAt: Date?
    public let terminalAt: Date?
    public let activity: WorkerActivity?
    /// The Server's reading of the whole job across its Runs (`deriveWorkerJob`).
    public let job: WorkerJob
    public let runs: [WorkerTurn]
    /// The Server's live readings of every pull request its turns named, newest first.
    public var pullRequests: [WorkerPullRequest]? = nil
    public let workerStatus: WorkerStatus
    public var branch: String? = nil
    public var runtime: WorkerRuntime? = nil
    public var model: String? = nil
    public var environmentName: String? = nil
    public var closingAt: Date? = nil
    public var closedAt: Date? = nil

    /// The newest live reading, which outlives a Run's frozen snapshot.
    public var pullRequest: WorkerPullRequest? { pullRequests?.first }

    /// Where the Worker runs: `computer`, `cursor`, or `claude`.
    public var provider: String { place.kind }

    /// The provider's status for the newest turn, which the card's lifecycle copy reads.
    public var status: WorkerTurnStatus { runs.first?.status ?? .queued }
    /// When someone asked the newest turn to stop.
    public var cancelRequestedAt: Date? { runs.first?.stopRequestedAt }

    enum CodingKeys: String, CodingKey {
        case id, agentId, taskId, place, providerUrl, repository, startingRef, title
        case createdAt, updatedAt, startedAt, terminalAt, activity, job
        case runs = "turns"
        case pullRequests
        case workerStatus = "status"
        case branch, runtime, model, environmentName, closingAt, closedAt
    }
}

/// The record's place: a Computer place names its Computer.
public struct WorkerPlace: Codable, Hashable, Sendable {
    public let kind: String
    public let computerId: String?
    public let computerName: String?

    enum CodingKeys: String, CodingKey {
        case kind, computerId, computerName
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        kind = try container.decode(String.self, forKey: .kind)
        switch kind {
        case "computer":
            computerId = try container.decode(String.self, forKey: .computerId)
            computerName = try container.decode(String?.self, forKey: .computerName)
        case "cursor", "claude":
            computerId = nil
            computerName = nil
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .kind, in: container, debugDescription: "Unknown Worker place \(kind)."
            )
        }
    }
}

public struct WorkerActivity: Codable, Hashable, Sendable {
    public let at: Date
    public let summary: String
}

public struct WorkerTurn: Codable, Hashable, Sendable {
    public let runId: String
    public let status: WorkerTurnStatus
    /// When the Run was queued: the job's start, or when a follow-up was sent.
    public let createdAt: Date
    public let branches: [WorkerBranch]
    public let startedAt: Date?
    public let terminalAt: Date?
    public let summary: String?
    public let errorCode: String?
    /// Nil only for a Server older than the model contract.
    public let model: WorkerTurnModel?
    public let stopRequestedAt: Date?

    enum CodingKeys: String, CodingKey {
        case runId = "turnId"
        case status, createdAt, branches, startedAt, terminalAt, summary, errorCode, model
        case stopRequestedAt
    }
}

public struct WorkerBranch: Codable, Hashable, Sendable {
    public let branch: String
    public let repository: String
    public let pullRequestUrl: String?
    public let pullRequest: WorkerPullRequest?
}

public struct WorkerPullRequest: Codable, Hashable, Sendable {
    public let additions: Int
    public let changedFiles: Int
    public let deletions: Int
    public let number: Int
    public let state: String
    public let observedAt: Date
}
