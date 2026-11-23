import Foundation

/// One choice a Worker's harness offered (`workerQuestionOptionSchema`).
public struct WorkerQuestionOption: Codable, Hashable, Sendable {
    public let description: String?
    public let label: String

    public init(label: String, description: String?) {
        self.label = label
        self.description = description
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        description = try container.decode(String?.self, forKey: .description)
        label = try container.decode(String.self, forKey: .label)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(description, forKey: .description)
        try container.encode(label, forKey: .label)
    }

    private enum CodingKeys: String, CodingKey { case description, label }
}

/// One structured question a Worker's harness asked (`workerQuestionSchema`).
/// With no options it takes only a typed answer.
public struct WorkerQuestion: Codable, Hashable, Sendable {
    public let header: String?
    public let multiSelect: Bool
    public let options: [WorkerQuestionOption]
    public let question: String

    public init(question: String, header: String?, multiSelect: Bool, options: [WorkerQuestionOption]) {
        self.question = question
        self.header = header
        self.multiSelect = multiSelect
        self.options = options
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        header = try container.decode(String?.self, forKey: .header)
        multiSelect = try container.decode(Bool.self, forKey: .multiSelect)
        options = try container.decode([WorkerQuestionOption].self, forKey: .options)
        question = try container.decode(String.self, forKey: .question)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(header, forKey: .header)
        try container.encode(multiSelect, forKey: .multiSelect)
        try container.encode(options, forKey: .options)
        try container.encode(question, forKey: .question)
    }

    private enum CodingKeys: String, CodingKey { case header, multiSelect, options, question }
}

/// Why an asking turn's questions closed without an answer (`workerQuestionsClosedSchema`).
public struct WorkerQuestionsClosed: Codable, Hashable, Sendable {
    public enum Reason: String, Codable, Hashable, Sendable { case dismissed, stopped }

    public let at: Date
    public let by: WorkerActorRef
    public let reason: Reason

    public init(at: Date, by: WorkerActorRef, reason: Reason) {
        self.at = at
        self.by = by
        self.reason = reason
    }
}
