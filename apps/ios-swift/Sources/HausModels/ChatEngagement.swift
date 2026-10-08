import Foundation

/// An Agent engaging one Chat: its active run has read a human message there
/// and not answered it yet (ADR 0035). Volatile — derived on the Server,
/// announced live, recovered through `chat.engagements`, never replayed.
public struct ChatEngagement: Codable, Sendable, Equatable, Hashable {
    public let agentID: String
    public let chatID: String
    public let runID: String
    public let startedAt: Date

    public init(agentID: String, chatID: String, runID: String, startedAt: Date) {
        self.agentID = agentID
        self.chatID = chatID
        self.runID = runID
        self.startedAt = startedAt
    }

    enum CodingKeys: String, CodingKey {
        case agentID = "agentId"
        case chatID = "chatId"
        case runID = "runId"
        case startedAt
    }
}

/// `chat.engagements`: the durable read every (re)connect starts from.
public struct ChatEngagements: Codable, Sendable, Equatable {
    public let engagements: [ChatEngagement]

    public init(engagements: [ChatEngagement]) {
        self.engagements = engagements
    }
}

/// Why an engagement ended: the Agent answered with `--done`, its run settled,
/// or the run was interrupted.
public enum ChatEngagementEndReason: String, Codable, Sendable, Equatable {
    case sent
    case settled
    case interrupted
}

/// One `chat.onEngagement` event.
public struct ChatEngagementEvent: Decodable, Sendable, Equatable {
    public enum Kind: Sendable, Equatable {
        case started
        case ended(ChatEngagementEndReason)
    }

    public let agentID: String
    public let chatID: String
    public let emittedAt: Date
    public let runID: String
    public let serverID: String
    public let kind: Kind

    public init(
        agentID: String,
        chatID: String,
        emittedAt: Date,
        runID: String,
        serverID: String,
        kind: Kind
    ) {
        self.agentID = agentID
        self.chatID = chatID
        self.emittedAt = emittedAt
        self.runID = runID
        self.serverID = serverID
        self.kind = kind
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        agentID = try container.decode(String.self, forKey: .agentID)
        chatID = try container.decode(String.self, forKey: .chatID)
        emittedAt = try container.decode(Date.self, forKey: .emittedAt)
        runID = try container.decode(String.self, forKey: .runID)
        serverID = try container.decode(String.self, forKey: .serverID)
        switch try container.decode(String.self, forKey: .type) {
        case "chat.engagement.started":
            kind = .started
        case "chat.engagement.ended":
            // An end this build has no word for still ends the engagement.
            let reason = try container.decode(String.self, forKey: .reason)
            kind = .ended(ChatEngagementEndReason(rawValue: reason) ?? .settled)
        case let other:
            throw DecodingError.dataCorruptedError(
                forKey: .type,
                in: container,
                debugDescription: "Unknown chat engagement event \(other)."
            )
        }
    }

    static let knownTypes: Set<String> = ["chat.engagement.started", "chat.engagement.ended"]

    enum CodingKeys: String, CodingKey {
        case agentID = "agentId"
        case chatID = "chatId"
        case emittedAt
        case reason
        case runID = "runId"
        case serverID = "serverId"
        case type
    }

    /// Whether this event names the same Agent run as `engagement`.
    public func names(_ engagement: ChatEngagement) -> Bool {
        engagement.agentID == agentID && engagement.runID == runID
    }
}

/// One `chat.onEngagement` stream frame. A frame type this build does not
/// know yet carries no event and is skipped, so a newer Server never breaks
/// the stream.
public struct ChatEngagementFrame: Decodable, Sendable, Equatable {
    public let event: ChatEngagementEvent?

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: ChatEngagementEvent.CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)
        event = ChatEngagementEvent.knownTypes.contains(type) ? try ChatEngagementEvent(from: decoder) : nil
    }
}

extension [ChatEngagement] {
    /// The web's `applyChatEngagementEvent`: a start adds its run once, an end
    /// removes it. Nil when the event changes nothing, so a repeat or an end
    /// for a run this list never held is not presented as an end.
    public func applying(_ event: ChatEngagementEvent) -> [ChatEngagement]? {
        let known = contains(where: event.names)
        switch event.kind {
        case .started:
            guard !known else { return nil }
            return self + [
                ChatEngagement(
                    agentID: event.agentID,
                    chatID: event.chatID,
                    runID: event.runID,
                    startedAt: event.emittedAt
                ),
            ]
        case .ended:
            return known ? filter { !event.names($0) } : nil
        }
    }

    /// Whether `agentID`'s `runID` is one of these engagements. Thoughts and
    /// holds only show for the run engaging this Chat.
    public func engages(agentID: String, runID: String) -> Bool {
        contains { $0.agentID == agentID && $0.runID == runID }
    }
}

/// A volatile Agent thought announced to one Chat (ADR 0036). Never persisted.
public struct AgentThoughtEvent: Decodable, Sendable, Equatable {
    public let agentID: String
    public let at: Date
    public let chatID: String
    public let runID: String
    public let serverID: String
    public let text: String

    public init(agentID: String, at: Date, chatID: String, runID: String, serverID: String, text: String) {
        self.agentID = agentID
        self.at = at
        self.chatID = chatID
        self.runID = runID
        self.serverID = serverID
        self.text = text
    }

    enum CodingKeys: String, CodingKey {
        case agentID = "agentId"
        case at
        case chatID = "chatId"
        case runID = "runId"
        case serverID = "serverId"
        case text
    }
}
