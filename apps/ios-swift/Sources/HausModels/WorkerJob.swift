import Foundation

/// How a Cloud Agent job reads: Cursor's own status for the newest Run Cursor
/// has received, in Cursor's vocabulary. `queued` is never a job state — a job
/// whose first Run has not started yet is `working`.
public enum WorkerJobState: String, Codable, CaseIterable, Hashable, Sendable {
    case working, done, failed, cancelled, expired
    case pendingInput = "pending-input"
}

/// A follow-up Run the delegating Agent sent after the first one. `waiting`
/// dates from when it was queued; `running` from when the provider started it.
public struct WorkerFollowUp: Codable, Hashable, Sendable {
    public enum State: String, Codable, Hashable, Sendable { case waiting, running, stalled }

    public let state: State
    public let since: Date

    public init(state: State, since: Date) {
        self.state = state
        self.since = since
    }
}

/// The Server-derived job (`deriveWorkerJob` in `packages/haus-api`). Each
/// case carries exactly the fields its wire variant does, so a failed job
/// cannot lose its report and a working one cannot claim a settle time. A
/// `pendingInput` job is a hosted agent that stopped to ask the delegating
/// Agent something; `question` is what it asked.
public enum WorkerJob: Hashable, Sendable {
    case working(startedAt: Date?, followUp: WorkerFollowUp?)
    case done(startedAt: Date?, settledAt: Date?, followUp: WorkerFollowUp?)
    case failed(errorCode: String?, summary: String?, settledAt: Date?, followUp: WorkerFollowUp?)
    case cancelled(settledAt: Date?, followUp: WorkerFollowUp?)
    case expired(settledAt: Date?, followUp: WorkerFollowUp?)
    case pendingInput(question: String?, startedAt: Date?, settledAt: Date?, followUp: WorkerFollowUp?)

    public var state: WorkerJobState {
        switch self {
        case .working: .working
        case .done: .done
        case .failed: .failed
        case .cancelled: .cancelled
        case .expired: .expired
        case .pendingInput: .pendingInput
        }
    }

    public var followUp: WorkerFollowUp? {
        switch self {
        case .working(_, let followUp), .done(_, _, let followUp), .failed(_, _, _, let followUp),
             .cancelled(_, let followUp), .expired(_, let followUp), .pendingInput(_, _, _, let followUp):
            followUp
        }
    }

    /// When the Run the state comes from settled; nil while working.
    public var settledAt: Date? {
        switch self {
        case .working: nil
        case .done(_, let settledAt, _), .failed(_, _, let settledAt, _),
             .cancelled(let settledAt, _), .expired(let settledAt, _),
             .pendingInput(_, _, let settledAt, _):
            settledAt
        }
    }
}

extension WorkerJob: Codable {
    private enum CodingKeys: String, CodingKey {
        case errorCode, followUp, question, settledAt, startedAt, state, summary
    }

    // Every key a variant names is required on the wire (null when unknown),
    // matching the Server's strict schema.
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let followUp = try container.decode(WorkerFollowUp?.self, forKey: .followUp)
        switch try container.decode(WorkerJobState.self, forKey: .state) {
        case .working:
            self = .working(startedAt: try container.decode(Date?.self, forKey: .startedAt), followUp: followUp)
        case .done:
            self = .done(
                startedAt: try container.decode(Date?.self, forKey: .startedAt),
                settledAt: try container.decode(Date?.self, forKey: .settledAt),
                followUp: followUp
            )
        case .failed:
            self = .failed(
                errorCode: try container.decode(String?.self, forKey: .errorCode),
                summary: try container.decode(String?.self, forKey: .summary),
                settledAt: try container.decode(Date?.self, forKey: .settledAt),
                followUp: followUp
            )
        case .cancelled:
            self = .cancelled(settledAt: try container.decode(Date?.self, forKey: .settledAt), followUp: followUp)
        case .expired:
            self = .expired(settledAt: try container.decode(Date?.self, forKey: .settledAt), followUp: followUp)
        case .pendingInput:
            self = .pendingInput(
                question: try container.decode(String?.self, forKey: .question),
                startedAt: try container.decode(Date?.self, forKey: .startedAt),
                settledAt: try container.decode(Date?.self, forKey: .settledAt),
                followUp: followUp
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(state, forKey: .state)
        try container.encode(followUp, forKey: .followUp)
        switch self {
        case .working(let startedAt, _):
            try container.encode(startedAt, forKey: .startedAt)
        case .done(let startedAt, let settledAt, _):
            try container.encode(startedAt, forKey: .startedAt)
            try container.encode(settledAt, forKey: .settledAt)
        case .failed(let errorCode, let summary, let settledAt, _):
            try container.encode(errorCode, forKey: .errorCode)
            try container.encode(summary, forKey: .summary)
            try container.encode(settledAt, forKey: .settledAt)
        case .cancelled(let settledAt, _), .expired(let settledAt, _):
            try container.encode(settledAt, forKey: .settledAt)
        case .pendingInput(let question, let startedAt, let settledAt, _):
            try container.encode(question, forKey: .question)
            try container.encode(startedAt, forKey: .startedAt)
            try container.encode(settledAt, forKey: .settledAt)
        }
    }
}
