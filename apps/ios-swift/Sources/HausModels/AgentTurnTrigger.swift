import Foundation

public struct AgentTurnTriggerPreview: Codable, Hashable, Sendable {
    public let attachmentCount: Int
    public let content: String
}

public enum AgentTurnTriggerAuthor: String, Codable, Hashable, Sendable {
    case agent
    case human
}

public enum AgentTurnTrigger: Hashable, Sendable {
    case message(author: AgentTurnTriggerAuthor, chatID: String, messageID: String, preview: AgentTurnTriggerPreview?)
    case claim(chatID: String, messageID: String, preview: AgentTurnTriggerPreview?)
    case reminder(chatID: String)
    case trigger(chatID: String)
    case pullRequest(chatID: String)
    case onboarding(chatID: String)
    case greeting(chatID: String)
    case subagent
    /// An Issue assigned to the agent or changed under it; `more` counts the
    /// others its run coalesced.
    case issue(code: String, issueID: String, title: String, more: Int?)
    case hidden
}

extension AgentTurnTrigger: Decodable {
    enum CodingKeys: String, CodingKey {
        case author, code, kind, more, preview, title
        case chatID = "chatId"
        case issueID = "issueId"
        case messageID = "messageId"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let chatID = { try container.decode(String.self, forKey: .chatID) }
        switch try container.decode(String.self, forKey: .kind) {
        case "message":
            self = .message(
                author: try container.decode(AgentTurnTriggerAuthor.self, forKey: .author),
                chatID: try chatID(),
                messageID: try container.decode(String.self, forKey: .messageID),
                preview: try container.decode(AgentTurnTriggerPreview?.self, forKey: .preview)
            )
        case "claim":
            self = .claim(
                chatID: try chatID(),
                messageID: try container.decode(String.self, forKey: .messageID),
                preview: try container.decode(AgentTurnTriggerPreview?.self, forKey: .preview)
            )
        case "reminder": self = .reminder(chatID: try chatID())
        case "trigger": self = .trigger(chatID: try chatID())
        case "pull_request": self = .pullRequest(chatID: try chatID())
        case "onboarding": self = .onboarding(chatID: try chatID())
        case "greeting": self = .greeting(chatID: try chatID())
        case "subagent": self = .subagent
        case "issue":
            self = .issue(
                code: try container.decode(String.self, forKey: .code),
                issueID: try container.decode(String.self, forKey: .issueID),
                title: try container.decode(String.self, forKey: .title),
                more: try container.decodeIfPresent(Int.self, forKey: .more)
            )
        case "private": self = .hidden
        case let kind:
            throw DecodingError.dataCorruptedError(
                forKey: .kind, in: container, debugDescription: "Unknown turn trigger \(kind)."
            )
        }
    }
}

public struct AgentRunTriggerEntry: Decodable, Hashable, Sendable {
    public let runID: String
    public let trigger: AgentTurnTrigger?

    enum CodingKeys: String, CodingKey {
        case runID = "runId"
        case trigger
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        runID = try container.decode(String.self, forKey: .runID)
        trigger = try container.decode(AgentTurnTrigger?.self, forKey: .trigger)
    }
}
