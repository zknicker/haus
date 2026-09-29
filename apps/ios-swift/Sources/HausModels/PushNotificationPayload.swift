import Foundation

/// The Haus keys a Needs you push carries beside the standard `aps` dictionary.
/// They name the same conversation a Needs you row does, so a tap opens what
/// the row would have opened.
public struct PushNotificationPayload: Sendable, Equatable {
    public let serverID: String
    /// The Chat holding the addressing message: a Thread's own Chat for a
    /// Thread notification, else the Channel or DM.
    public let chatID: String
    /// The Channel or DM the conversation belongs to, never a Thread.
    public let conversationChatID: String
    /// The Thread's anchor in `conversationChatID`; nil for a top-level Chat.
    public let threadAnchorMessageID: String?
    public let messageID: String

    public init(
        serverID: String,
        chatID: String,
        conversationChatID: String,
        threadAnchorMessageID: String?,
        messageID: String
    ) {
        self.serverID = serverID
        self.chatID = chatID
        self.conversationChatID = conversationChatID
        self.threadAnchorMessageID = threadAnchorMessageID
        self.messageID = messageID
    }

    /// Parses a notification's `userInfo`. Nil when a required key is missing
    /// or the Thread shape is inconsistent, so a malformed push opens nothing
    /// rather than the wrong conversation.
    public init?(userInfo: [AnyHashable: Any]) {
        guard let serverID = Self.string(userInfo["serverId"]),
              let chatID = Self.string(userInfo["chatId"]),
              let conversationChatID = Self.string(userInfo["conversationChatId"]),
              let messageID = Self.string(userInfo["messageId"])
        else { return nil }
        let anchor = Self.string(userInfo["threadAnchorMessageId"])
        // The Needs you contract's own rule: a Thread names its anchor, and a
        // top-level Chat is its own conversation.
        guard (anchor == nil) == (chatID == conversationChatID) else { return nil }
        self.init(
            serverID: serverID,
            chatID: chatID,
            conversationChatID: conversationChatID,
            threadAnchorMessageID: anchor,
            messageID: messageID
        )
    }

    /// Where a tap lands.
    public var route: PushNotificationRoute {
        if let threadAnchorMessageID {
            return .thread(
                conversationChatID: conversationChatID,
                threadChatID: chatID,
                anchorMessageID: threadAnchorMessageID
            )
        }
        return .chat(chatID: chatID)
    }

    private static func string(_ value: Any?) -> String? {
        guard let value = value as? String, !value.isEmpty else { return nil }
        return value
    }
}

/// The screen a tapped notification opens: a DM or Channel on the canvas, or
/// a Thread pushed over it — the same two places a Needs you row opens.
public enum PushNotificationRoute: Sendable, Equatable {
    case chat(chatID: String)
    case thread(conversationChatID: String, threadChatID: String, anchorMessageID: String)
}

/// What a notification arriving while Haus is frontmost does.
public enum PushForegroundPresentation: Sendable, Equatable {
    /// The reader is already looking at the conversation; the message is on
    /// screen, so a banner would only repeat it.
    case suppress
    case banner

    /// - Parameters:
    ///   - viewingServerID: the Server the app is showing.
    ///   - viewingChatID: the Chat on screen right now — a pushed Thread's own
    ///     Chat, or the canvas Chat — and nil when the Inbox, the Task list, or
    ///     nothing is showing.
    public static func decide(
        _ payload: PushNotificationPayload?,
        viewingServerID: String?,
        viewingChatID: String?
    ) -> PushForegroundPresentation {
        guard let payload,
              let viewingChatID,
              payload.serverID == viewingServerID,
              payload.chatID == viewingChatID
        else { return .banner }
        return .suppress
    }
}
