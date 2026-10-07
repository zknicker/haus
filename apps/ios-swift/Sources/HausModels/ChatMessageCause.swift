import Foundation

/// Why a message exists: the automation fire that produced it.
///
/// The Server attaches this to messages a Reminder or Trigger caused
/// (`messageCauseSchema`). It is an evolving wire shape — new keys ship on the
/// Server independent of client releases — so unknown keys decode away and an
/// unknown `kind` keeps its raw string rather than failing the row. `title`,
/// `summary`, `description`, and `firedAt` are snapshotted when the cause is
/// recorded, so the provenance outlives the automation; `live` is the
/// automation as it stands now, null once it has been archived.
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

    /// The automation as it stands now, read live from its record.
    public struct Live: Codable, Sendable, Equatable {
        public let fireCount: Int
        /// The Trigger's standing instruction or the Reminder's script, snipped.
        public let instruction: String?
        public let lastFiredAt: Date?
        /// `armed`, `scheduled`, `fired`, `canceled`, or `disabled`.
        public let status: String

        public init(fireCount: Int, instruction: String?, lastFiredAt: Date?, status: String) {
            self.fireCount = fireCount
            self.instruction = instruction
            self.lastFiredAt = lastFiredAt
            self.status = status
        }
    }

    /// `explicit` when the Agent named the fire, `inferred` when the Server did.
    public let attribution: String
    public let automationID: String
    /// What a Reminder's short title stands for; null for a Trigger.
    public let description: String?
    public let firedAt: Date
    public let fireID: String
    public let kind: Kind
    public let live: Live?
    public let ownerAgentID: String
    /// A Reminder's cadence or a Trigger's kind label ("Webhook").
    public let summary: String
    public let title: String

    enum CodingKeys: String, CodingKey {
        case attribution
        case automationID = "automationId"
        case description
        case firedAt
        case fireID = "fireId"
        case kind
        case live
        case ownerAgentID = "ownerAgentId"
        case summary
        case title
    }

    public init(
        attribution: String,
        automationID: String,
        description: String?,
        firedAt: Date,
        fireID: String,
        kind: Kind,
        live: Live?,
        ownerAgentID: String,
        summary: String,
        title: String
    ) {
        self.attribution = attribution
        self.automationID = automationID
        self.description = description
        self.firedAt = firedAt
        self.fireID = fireID
        self.kind = kind
        self.live = live
        self.ownerAgentID = ownerAgentID
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
        reactions = try container.decodeIfPresent([ChatMessageReaction].self, forKey: .reactions) ?? []
        reply = try container.decodeIfPresent(ChatMessageReply.self, forKey: .reply)
        runID = try container.decodeIfPresent(String.self, forKey: .runID)
        sequence = try container.decode(Int.self, forKey: .sequence)
        serverID = try container.decode(String.self, forKey: .serverID)
        sessionGeneration = try container.decodeIfPresent(Int.self, forKey: .sessionGeneration)
        task = try container.decodeIfPresent(MessageTask.self, forKey: .task)
    }
}
