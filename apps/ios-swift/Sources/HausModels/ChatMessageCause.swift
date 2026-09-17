import Foundation

/// Why a message exists: the automation fire that produced it.
///
/// The Server attaches this to messages an automation caused. It is an
/// evolving wire shape — new keys ship on the Server independent of client
/// releases — so unknown keys decode away and an unknown `kind` keeps its raw
/// string rather than failing the row.
public struct ChatMessageCause: Codable, Sendable, Equatable {
    /// Server-defined automation kinds, tolerant of values this build does not
    /// know, in the same shape as `ChatAuthor.SystemAuthor`.
    public enum Kind: Codable, Sendable, Equatable {
        case reminder
        case trigger
        case unknown(String)

        public init(from decoder: Decoder) throws {
            let raw = try decoder.singleValueContainer().decode(String.self)
            switch raw {
            case "reminder": self = .reminder
            case "trigger": self = .trigger
            default: self = .unknown(raw)
            }
        }

        public func encode(to encoder: Encoder) throws {
            var container = encoder.singleValueContainer()
            switch self {
            case .reminder: try container.encode("reminder")
            case .trigger: try container.encode("trigger")
            case .unknown(let raw): try container.encode(raw)
            }
        }
    }

    public let automationID: String
    public let fireCount: Int
    public let fireID: String
    public let instruction: String?
    public let kind: Kind
    public let lastFiredAt: Date?
    public let status: String
    public let summary: String
    public let title: String

    enum CodingKeys: String, CodingKey {
        case automationID = "automationId"
        case fireCount
        case fireID = "fireId"
        case instruction
        case kind
        case lastFiredAt
        case status
        case summary
        case title
    }

    public init(
        automationID: String,
        fireCount: Int,
        fireID: String,
        instruction: String?,
        kind: Kind,
        lastFiredAt: Date?,
        status: String,
        summary: String,
        title: String
    ) {
        self.automationID = automationID
        self.fireCount = fireCount
        self.fireID = fireID
        self.instruction = instruction
        self.kind = kind
        self.lastFiredAt = lastFiredAt
        self.status = status
        self.summary = summary
        self.title = title
    }
}

/// `ChatMessage` decodes by hand for one reason: provenance is decorative, and
/// a malformed `cause` object must not cost the reader the page. The nested
/// decode is a `try?`, so a missing, null, or unreadable cause all land as
/// `nil` while every load-bearing field still fails loudly.
///
/// The initializer lives in an extension so the synthesized memberwise
/// initializer survives for callers that build a message directly.
extension ChatMessage {
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        attachments = try container.decode([AttachmentMetadata].self, forKey: .attachments)
        author = try container.decode(ChatAuthor.self, forKey: .author)
        body = try container.decodeIfPresent(ChatMessageBody.self, forKey: .body)
        cause = try? container.decodeIfPresent(ChatMessageCause.self, forKey: .cause)
        chatID = try container.decode(String.self, forKey: .chatID)
        content = try container.decode(String.self, forKey: .content)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        id = try container.decode(String.self, forKey: .id)
        nonce = try container.decode(String.self, forKey: .nonce)
        reply = try container.decodeIfPresent(ChatMessageReply.self, forKey: .reply)
        runID = try container.decodeIfPresent(String.self, forKey: .runID)
        sequence = try container.decode(Int.self, forKey: .sequence)
        serverID = try container.decode(String.self, forKey: .serverID)
        sessionGeneration = try container.decodeIfPresent(Int.self, forKey: .sessionGeneration)
        task = try container.decodeIfPresent(MessageTask.self, forKey: .task)
    }
}
