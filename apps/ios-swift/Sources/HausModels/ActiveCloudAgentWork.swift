import Foundation

/// One queued or running Cloud Agent work visible to the viewer, with
/// everything the Inbox's "Happening now" section needs to name it and open its
/// conversation. Like `OpenAsk`, the Chat facts always name the Channel or DM,
/// never a Thread. Server membership and Chat access gate the read, so work the
/// viewer cannot see never arrives and no client-side filtering is needed.
public struct ActiveCloudAgentWork: Decodable, Identifiable, Sendable, Equatable {
    public let chatKind: ChatKind
    public let chatName: String?
    public let chatPeerUserID: String?
    public let conversationChatID: String
    /// Where opening this row goes. Read from the Server's `location`; a
    /// Server that predates it implies the launch work Thread.
    public let location: ActiveCloudAgentWorkLocation
    /// The launch Message and its Thread anchor, from a Server that still
    /// sends them. Nothing routes by them; the contraction slice drops them.
    public let message: ChatMessage?
    public let threadAnchorMessage: ChatMessage?
    public let work: CloudAgentWork

    public var id: String { work.id }

    /// The anchor Message the row already carries for a `work-thread`
    /// location, so the Thread opens without a read.
    public var carriedThreadAnchor: ChatMessage? {
        guard case .workThread(_, let anchorMessageID) = location else { return nil }
        return [threadAnchorMessage, message].compactMap { $0 }.first { $0.id == anchorMessageID }
    }

    enum CodingKeys: String, CodingKey {
        case chatKind
        case chatName
        case chatPeerUserID = "chatPeerUserId"
        case conversationChatID = "conversationChatId"
        case location
        case message
        case threadAnchorMessage
        case threadChatID = "threadChatId"
        case work
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        chatKind = try container.decode(ChatKind.self, forKey: .chatKind)
        chatName = try container.decodeIfPresent(String.self, forKey: .chatName)
        chatPeerUserID = try container.decodeIfPresent(String.self, forKey: .chatPeerUserID)
        conversationChatID = try container.decode(String.self, forKey: .conversationChatID)
        message = try container.decodeIfPresent(ChatMessage.self, forKey: .message)
        threadAnchorMessage = try container.decodeIfPresent(ChatMessage.self, forKey: .threadAnchorMessage)
        work = try container.decode(CloudAgentWork.self, forKey: .work)
        if let location = try container.decodeIfPresent(ActiveCloudAgentWorkLocation.self, forKey: .location) {
            self.location = location
        } else {
            let threadChatID = try container.decode(String.self, forKey: .threadChatID)
            guard let anchor = threadAnchorMessage ?? message else {
                throw DecodingError.keyNotFound(
                    CodingKeys.message,
                    .init(codingPath: container.codingPath, debugDescription: "Expected a location or a launch Message.")
                )
            }
            location = .workThread(threadChatID: threadChatID, anchorMessageID: anchor.id)
        }
    }
}

/// Where "Happening now" opens one work (ADR 0044, Q4).
public enum ActiveCloudAgentWorkLocation: Hashable, Sendable {
    /// The launch work Thread, which the viewer can read.
    case workThread(threadChatID: String, anchorMessageID: String)
    /// The newest visible linking Message. `chatID` is always the Channel or
    /// DM; `threadChatID` is the Thread the Message sits in or anchors, which
    /// opens when set. Opening never creates or follows a Thread.
    case message(chatID: String, messageID: String, threadChatID: String?)
}

extension ActiveCloudAgentWorkLocation: Decodable {
    private enum CodingKeys: String, CodingKey {
        case anchorMessageID = "anchorMessageId"
        case chatID = "chatId"
        case kind
        case messageID = "messageId"
        case threadChatID = "threadChatId"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try container.decode(String.self, forKey: .kind)
        switch kind {
        case "work-thread":
            self = .workThread(
                threadChatID: try container.decode(String.self, forKey: .threadChatID),
                anchorMessageID: try container.decode(String.self, forKey: .anchorMessageID)
            )
        case "message":
            self = .message(
                chatID: try container.decode(String.self, forKey: .chatID),
                messageID: try container.decode(String.self, forKey: .messageID),
                threadChatID: try container.decodeIfPresent(String.self, forKey: .threadChatID)
            )
        default:
            throw UnknownKind(kind: kind)
        }
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
