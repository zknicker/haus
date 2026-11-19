import Foundation

/// One queued or running Cloud Agent work visible to the viewer, with
/// everything the Inbox's "Happening now" section needs to name it and open its
/// viewer cannot see never arrives and no client-side filtering is needed.
public struct ActiveCloudAgentWork: Decodable, Identifiable, Sendable, Equatable {
    /// The delegating Agent's stored display name; a retired Agent keeps it.
    public let agentName: String
    public let chatKind: ChatKind
    public let chatName: String?
    public let chatPeerUserID: String?
    public let conversationChatID: String
    /// Where opening this row goes.
    public let location: ActiveCloudAgentWorkLocation
    public let work: CloudAgentWork
    public var taskID: String? = nil
    public var taskKey: String? = nil

    public var id: String { work.id }

    enum CodingKeys: String, CodingKey {
        case agentName
        case chatKind
        case chatName
        case chatPeerUserID = "chatPeerUserId"
        case conversationChatID = "conversationChatId"
        case location
        case work = "worker"
        case taskID = "taskId"
        case taskKey
    }
}

public enum ActiveCloudAgentWorkLocation: Hashable, Sendable {
    case message(chatID: String, messageID: String)
}

extension ActiveCloudAgentWorkLocation: Decodable {
    private enum CodingKeys: String, CodingKey {
        case chatID = "chatId"
        case kind
        case messageID = "messageId"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try container.decode(String.self, forKey: .kind)
        guard kind == "message" else { throw UnknownKind(kind: kind) }
        self = .message(
            chatID: try container.decode(String.self, forKey: .chatID),
            messageID: try container.decode(String.self, forKey: .messageID)
        )
    }

    /// A location kind this build does not know. The list read skips that
    /// one row rather than failing "Happening now" as a whole.
    public struct UnknownKind: Error, Equatable {
        public let kind: String
    }
}

/// The `cloudAgentWork.listActive` read. A row whose location kind is newer
/// than this build is left out; any other malformed row still fails the read.
public struct ActiveCloudAgentWorkList: Decodable, Sendable, Equatable {
    public let rows: [ActiveCloudAgentWork]

    public init(rows: [ActiveCloudAgentWork]) {
        self.rows = rows
    }

    public init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        var rows: [ActiveCloudAgentWork] = []
        while !container.isAtEnd {
            do {
                rows.append(try container.decode(ActiveCloudAgentWork.self))
            } catch is ActiveCloudAgentWorkLocation.UnknownKind {
                // A failed element decode does not advance the container.
                _ = try container.decode(SkippedRow.self)
            }
        }
        self.rows = rows
    }

    private struct SkippedRow: Decodable {}
}
