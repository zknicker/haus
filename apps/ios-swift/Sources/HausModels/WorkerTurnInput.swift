import Foundation

/// Who wrote a Worker turn's input or closed its questions: a person or the
/// delegating Agent.
public struct WorkerActorRef: Codable, Hashable, Sendable {
    public enum Kind: String, Codable, Hashable, Sendable { case agent, user }

    public let id: String
    public let kind: Kind

    public init(id: String, kind: Kind) {
        self.id = id
        self.kind = kind
    }
}

/// One piece of what a Worker turn was asked (`workerTurnInputSchema`): the
/// brief that started the job, or a follow-up.
public struct WorkerTurnInput: Codable, Hashable, Sendable {
    public enum Kind: String, Codable, Hashable, Sendable {
        case brief
        case followUp = "follow-up"
    }

    public let at: Date
    public let author: WorkerActorRef
    public let kind: Kind
    public let messageId: String?
    public let text: String

    public init(at: Date, author: WorkerActorRef, kind: Kind, messageId: String?, text: String) {
        self.at = at
        self.author = author
        self.kind = kind
        self.messageId = messageId
        self.text = text
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        at = try container.decode(Date.self, forKey: .at)
        author = try container.decode(WorkerActorRef.self, forKey: .author)
        kind = try container.decode(Kind.self, forKey: .kind)
        messageId = try container.decode(String?.self, forKey: .messageId)
        text = try container.decode(String.self, forKey: .text)
        guard !text.isEmpty else {
            throw DecodingError.dataCorruptedError(forKey: .text, in: container, debugDescription: "An input has text.")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(at, forKey: .at)
        try container.encode(author, forKey: .author)
        try container.encode(kind, forKey: .kind)
        try container.encode(messageId, forKey: .messageId)
        try container.encode(text, forKey: .text)
    }

    private enum CodingKeys: String, CodingKey {
        case at, author, kind, messageId, text
    }
}
