import Foundation
import HausModels

/// One Worker turn as the Worker view reads it: what was asked, the steps it
/// took, and how it ended.
public struct WorkerTurnRecord: Hashable, Sendable, Identifiable {
    public enum Outcome: Hashable, Sendable {
        case finished
        case needsYou
        case failed(reason: String?)
        case stopped
    }

    public let id: String
    public let prompts: [String]
    public let steps: [WorkerStepEntry]
    public let startedAt: Date?
    public let terminalAt: Date?
    public let outcome: Outcome?
    public let report: String?
    public let pullRequests: [WorkerCitedPullRequest]
    public let files: [String]

    public init(
        id: String,
        prompts: [String] = [],
        steps: [WorkerStepEntry] = [],
        startedAt: Date?,
        terminalAt: Date?,
        outcome: Outcome?,
        report: String? = nil,
        pullRequests: [WorkerCitedPullRequest] = [],
        files: [String] = []
    ) {
        self.id = id
        self.prompts = prompts
        self.steps = steps
        self.startedAt = startedAt
        self.terminalAt = terminalAt
        self.outcome = outcome
        self.report = report
        self.pullRequests = pullRequests
        self.files = files
    }

    public var isLive: Bool { outcome == nil }

    /// How long the turn ran, once it has both ends.
    public var span: TimeInterval? {
        guard let startedAt, let terminalAt else { return nil }
        return max(0, terminalAt.timeIntervalSince(startedAt))
    }

    /// Reads a wire turn: its input as prompts, its steps, and its settled
    /// outcome with the report's prose, pull requests, and cited Drive files.
    /// A turn that settled before outcomes existed reads its status and summary.
    public init(turn: WorkerTurn) {
        let settled = turn.outcome.map(Self.settled) ?? Self.legacySettled(turn)
        let branchPullRequests = turn.branches.compactMap { WorkerCitedPullRequest(branch: $0) }
        self.init(
            id: turn.runId,
            prompts: (turn.input ?? []).map(\.text),
            steps: (turn.steps ?? []).map(WorkerStepEntry.init(step:)),
            startedAt: turn.startedAt,
            terminalAt: turn.terminalAt,
            outcome: settled?.outcome,
            report: settled?.report,
            pullRequests: Self.merging(branchPullRequests, settled?.pullRequestUrls ?? []),
            files: settled?.report.map(WorkerDriveCitations.paths(in:)) ?? []
        )
    }

    static func legacySettled(_ turn: WorkerTurn) -> Settled? {
        guard let outcome = outcome(turn) else { return nil }
        guard let summary = turn.summary else { return Settled(outcome: outcome, report: nil, pullRequestUrls: []) }
        if case .failed = outcome { return Settled(outcome: .failed(reason: nil), report: summary, pullRequestUrls: []) }
        return Settled(outcome: outcome, report: summary, pullRequestUrls: [])
    }

    static func outcome(_ turn: WorkerTurn) -> Outcome? {
        switch turn.status {
        case .queued, .running: nil
        case .completed: .finished
        case .pendingInput: .needsYou
        case .cancelled: .stopped
        case .failed, .expired:
            .failed(reason: WorkerPresentation.failureReason(errorCode: turn.errorCode, summary: nil))
        }
    }
}

/// A pull request a turn named, as its chip reads: "haus#443".
public struct WorkerCitedPullRequest: Hashable, Sendable, Identifiable {
    public enum State: Hashable, Sendable { case open, draft, merged, closed, unknown }

    public let repository: String
    public let number: Int
    public let state: State
    public let url: URL?

    public init(repository: String, number: Int, state: State, url: URL?) {
        self.repository = repository
        self.number = number
        self.state = state
        self.url = url
    }

    public var id: String { "\(repository)#\(number)" }

    public var label: String {
        "\(repository.split(separator: "/").last.map(String.init) ?? repository)#\(number)"
    }

    init?(branch: WorkerBranch) {
        let number = branch.pullRequest?.number
            ?? branch.pullRequestUrl.flatMap(RichReferenceWireForm.pullRequestNumber(in:))
        guard let number else { return nil }
        self.init(
            repository: branch.repository,
            number: number,
            state: Self.state(branch.pullRequest?.state),
            url: WorkerPresentation.externalURL(branch.pullRequestUrl)
        )
    }

    static func state(_ wire: String?) -> State {
        switch wire {
        case "open": .open
        case "draft": .draft
        case "merged": .merged
        case "closed": .closed
        default: .unknown
        }
    }
}
