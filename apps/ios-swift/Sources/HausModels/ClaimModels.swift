import Foundation

/// The exact row returned by `claim.list`.
///
/// Claims remain promoted Chat messages. This projection keeps the canonical
/// message, claim metadata, and the claim's existing Thread summary together so
/// a native list can open the same Thread route as Chat.
public struct ClaimListItem: Codable, Identifiable, Sendable, Equatable {
    public let chatKind: ChatKind
    public let chatName: String?
    public let chatPeerUserID: String?
    public let message: ChatMessage
    public let claim: MessageClaim
    public let threadSummary: ThreadSummary

    public var id: String { message.id }

    public init(
        chatKind: ChatKind,
        chatName: String?,
        chatPeerUserID: String?,
        message: ChatMessage,
        claim: MessageClaim,
        threadSummary: ThreadSummary
    ) {
        self.chatKind = chatKind
        self.chatName = chatName
        self.chatPeerUserID = chatPeerUserID
        self.message = message
        self.claim = claim
        self.threadSummary = threadSummary
    }

    enum CodingKeys: String, CodingKey {
        case chatKind
        case chatName
        case chatPeerUserID = "chatPeerUserId"
        case message
        case claim
        case threadSummary
    }
}

/// The `claim.list` result. `backgroundCount` is how many background-tier claims
/// the same query hid, so a lens can say "N background" without a second round
/// trip; it is 0 whenever `includeBackground` already widened the lens.
public struct ClaimList: Decodable, Equatable, Sendable {
    public let backgroundCount: Int
    public let claims: [ClaimListItem]

    public init(backgroundCount: Int, claims: [ClaimListItem]) {
        self.backgroundCount = backgroundCount
        self.claims = claims
    }

    enum CodingKeys: String, CodingKey {
        case backgroundCount
        case claims
    }
}

/// Input for `claim.list`. `chatId` is omitted when the Tasks lens spans the
/// Server; the Server contract treats it as an optional filter.
/// `includeBackground` is omitted unless a caller wants the background tier the
/// Board and List hide; the Server defaults it to `false`.
public struct ClaimListInput: Encodable, Equatable, Sendable {
    public let chatID: String?
    public let includeBackground: Bool?
    public let serverID: String

    public init(serverID: String, chatID: String? = nil, includeBackground: Bool? = nil) {
        self.chatID = chatID
        self.includeBackground = includeBackground
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case chatID = "chatId"
        case includeBackground
        case serverID = "serverId"
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(chatID, forKey: .chatID)
        try container.encodeIfPresent(includeBackground, forKey: .includeBackground)
        try container.encode(serverID, forKey: .serverID)
    }
}

public struct ClaimUpdatePatch: Encodable, Equatable, Sendable {
    public let labelIDs: [String]?
    public let priority: TaskPriority?
    public let status: ClaimStatus?

    public init(
        status: ClaimStatus? = nil,
        priority: TaskPriority? = nil,
        labelIDs: [String]? = nil
    ) {
        self.labelIDs = labelIDs
        self.priority = priority
        self.status = status
    }

    enum CodingKeys: String, CodingKey {
        case labelIDs = "labelIds"
        case priority
        case status
    }
}

/// Input for `claim.update`. The Server rejects an empty patch; callers should
/// create a patch with at least one non-nil field.
public struct ClaimUpdateInput: Encodable, Equatable, Sendable {
    public let expectedVersion: Int
    public let messageID: String
    public let patch: ClaimUpdatePatch
    public let serverID: String

    public init(
        serverID: String,
        messageID: String,
        expectedVersion: Int,
        patch: ClaimUpdatePatch
    ) {
        self.expectedVersion = expectedVersion
        self.messageID = messageID
        self.patch = patch
        self.serverID = serverID
    }

    enum CodingKeys: String, CodingKey {
        case expectedVersion
        case messageID = "messageId"
        case patch
        case serverID = "serverId"
    }
}

public struct ClaimMutationReceipt: Decodable, Equatable, Sendable {
    public let claim: MessageClaim
}

public extension ClaimStatus {
    static let ordered: [ClaimStatus] = [.todo, .inProgress, .inReview, .done, .closed]

    var displayName: String {
        switch self {
        case .todo: "To do"
        case .inProgress: "In progress"
        case .inReview: "In review"
        case .done: "Done"
        case .closed: "Closed"
        }
    }
}

public extension TaskPriority {
    var displayName: String {
        switch self {
        case .none: "No priority"
        case .urgent: "Urgent"
        case .high: "High"
        case .medium: "Medium"
        case .low: "Low"
        }
    }
}
