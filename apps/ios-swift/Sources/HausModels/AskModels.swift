import Foundation

public enum AskStatus: String, Codable, Sendable {
    case open
    case answered
}

/// Who settled an Ask. Humans and Agents may both answer; only one ever does.
public struct AskAnsweredBy: Codable, Sendable, Equatable {
    public enum Kind: String, Codable, Sendable {
        case agent
        case user
    }

    public let id: String
    public let kind: Kind

    public init(id: String, kind: Kind) {
        self.id = id
        self.kind = kind
    }
}

/// One Agent-authored request for a named human's decision. The Message owns
/// authorship and Chat placement; this record owns the request and settlement.
public struct Ask: Codable, Identifiable, Sendable, Equatable {
    public let addresseeUserID: String
    public let agentID: String
    public let answerMessageID: String?
    public let answeredAt: Date?
    public let answeredBy: AskAnsweredBy?
    public let chatID: String
    public let createdAt: Date
    public let id: String
    public let messageID: String
    /// The ways forward the Agent offers, each a short reply the human can send
    /// as is. The first is the Agent's recommendation. Empty is an open
    /// question, whose answer is whatever the human writes.
    public let options: [String]
    public let status: AskStatus
    public let summary: String
    public let title: String

    enum CodingKeys: String, CodingKey {
        case addresseeUserID = "addresseeUserId"
        case agentID = "agentId"
        case answerMessageID = "answerMessageId"
        case answeredAt
        case answeredBy
        case chatID = "chatId"
        case createdAt
        case id
        case messageID = "messageId"
        case options
        case status
        case summary
        case title
    }
}

/// One open Ask addressed to the viewer, with everything a reader needs to
/// answer it and to open the conversation it came from.
///
/// `conversationChatID` and the Chat facts beside it always name the Channel or
/// DM the conversation belongs to — the Ask's own Chat when it is top-level,
/// and the Thread's parent when the Ask was posted inside a Thread. An answer
/// is an ordinary `chat.send` addressed to that conversation and to
/// `threadAnchor`, never to the Thread's own Chat id, so a row carries the same
/// pair a Thread composer sends. There is no answer procedure.
public struct OpenAsk: Decodable, Identifiable, Sendable, Equatable {
    public let ask: Ask
    public let chatKind: ChatKind
    public let chatName: String?
    public let chatPeerUserID: String?
    public let conversationChatID: String
    public let message: ChatMessage
    /// The Message the answer Thread hangs off, when that is not the Ask's own
    /// Message. Null for every top-level Ask, which anchors its own Thread —
    /// read it through `threadAnchor`.
    public let threadAnchorMessage: ChatMessage?
    public let threadChatID: String

    public var id: String { ask.id }

    /// The Message this Ask's answer replies to: the answer Thread's anchor.
    /// The Swift port of the shared `openAskThreadAnchor` helper.
    public var threadAnchor: ChatMessage { threadAnchorMessage ?? message }

    enum CodingKeys: String, CodingKey {
        case ask
        case chatKind
        case chatName
        case chatPeerUserID = "chatPeerUserId"
        case conversationChatID = "conversationChatId"
        case message
        case threadAnchorMessage
        case threadChatID = "threadChatId"
    }
}
