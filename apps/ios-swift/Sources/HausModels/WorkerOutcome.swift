import Foundation

/// How a turn's report says it ended (`workerReportOutcomeSchema`).
public enum WorkerReportOutcome: String, Codable, CaseIterable, Hashable, Sendable {
    case done, failed
    case needsYou = "needs-you"
}

/// Why a turn settled with no report (`workerFailureSchema`).
public enum WorkerFailure: String, Codable, CaseIterable, Hashable, Sendable {
    case noReport = "no-report"
    case machineOffline = "machine-offline"
    case machineRemoved = "machine-removed"
    case placeOff = "place-off"
    case launchRefused = "launch-refused"
    case harnessError = "harness-error"
    case providerError = "provider-error"
    case providerExpired = "provider-expired"
}

/// One turn's report (`workerReportSchema`). `ask` is what a needs-you report
/// asks for; `pullRequestUrls` are the pull requests the turn named.
public struct WorkerReport: Codable, Hashable, Sendable {
    public enum Source: String, Codable, Hashable, Sendable { case worker, provider }

    public let ask: String?
    public let messageId: String?
    public let outcome: WorkerReportOutcome
    public let personId: String?
    public let personRefused: String?
    public let pullRequestUrls: [String]
    public let questions: [WorkerQuestion]?
    public let questionsClosed: WorkerQuestionsClosed?
    public let source: Source
    public let text: String

    public init(
        outcome: WorkerReportOutcome,
        text: String,
        ask: String? = nil,
        source: Source = .worker,
        messageId: String? = nil,
        personId: String? = nil,
        personRefused: String? = nil,
        pullRequestUrls: [String] = [],
        questions: [WorkerQuestion]? = nil,
        questionsClosed: WorkerQuestionsClosed? = nil
    ) {
        self.outcome = outcome
        self.text = text
        self.ask = ask
        self.source = source
        self.messageId = messageId
        self.personId = personId
        self.personRefused = personRefused
        self.pullRequestUrls = pullRequestUrls
        self.questions = questions
        self.questionsClosed = questionsClosed
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        ask = try container.decode(String?.self, forKey: .ask)
        messageId = try container.decode(String?.self, forKey: .messageId)
        outcome = try container.decode(WorkerReportOutcome.self, forKey: .outcome)
        personId = try container.decode(String?.self, forKey: .personId)
        personRefused = try container.decode(String?.self, forKey: .personRefused)
        pullRequestUrls = try container.decode([String].self, forKey: .pullRequestUrls)
        questions = try container.decodeIfPresent([WorkerQuestion].self, forKey: .questions)
        questionsClosed = try container.decodeIfPresent(WorkerQuestionsClosed.self, forKey: .questionsClosed)
        source = try container.decode(Source.self, forKey: .source)
        text = try container.decode(String.self, forKey: .text)
        if let questions, questions.isEmpty {
            throw DecodingError.dataCorruptedError(
                forKey: .questions, in: container, debugDescription: "A report that asks asks at least one question."
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(ask, forKey: .ask)
        try container.encode(messageId, forKey: .messageId)
        try container.encode(outcome, forKey: .outcome)
        try container.encode(personId, forKey: .personId)
        try container.encode(personRefused, forKey: .personRefused)
        try container.encode(pullRequestUrls, forKey: .pullRequestUrls)
        try container.encodeIfPresent(questions, forKey: .questions)
        try container.encodeIfPresent(questionsClosed, forKey: .questionsClosed)
        try container.encode(source, forKey: .source)
        try container.encode(text, forKey: .text)
    }

    private enum CodingKeys: String, CodingKey {
        case ask, messageId, outcome, personId, personRefused, pullRequestUrls
        case questions, questionsClosed, source, text
    }
}

/// How a settled turn ended (`workerOutcomeSchema`): its report, a stop, or a
/// failure nobody wrote a report for.
public enum WorkerOutcome: Hashable, Sendable {
    case report(WorkerReport)
    case stopped
    case failed(reason: WorkerFailure, detail: String?)
}

extension WorkerOutcome: Codable {
    private enum Kind: String, Codable { case report, stopped, failed }

    private enum CodingKeys: String, CodingKey { case detail, kind, reason, report }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(Kind.self, forKey: .kind) {
        case .report:
            self = .report(try container.decode(WorkerReport.self, forKey: .report))
        case .stopped:
            self = .stopped
        case .failed:
            self = .failed(
                reason: try container.decode(WorkerFailure.self, forKey: .reason),
                detail: try container.decode(String?.self, forKey: .detail)
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .report(let report):
            try container.encode(Kind.report, forKey: .kind)
            try container.encode(report, forKey: .report)
        case .stopped:
            try container.encode(Kind.stopped, forKey: .kind)
        case .failed(let reason, let detail):
            try container.encode(Kind.failed, forKey: .kind)
            try container.encode(reason, forKey: .reason)
            try container.encode(detail, forKey: .detail)
        }
    }
}
