import Foundation

/// The Haus keys a message push carries beside the standard `aps` dictionary.
/// They name the place the message landed in, so a tap opens it.
public struct PushNotificationPayload: Sendable, Equatable {
    public let serverID: String
    /// The Chat a tap opens and a reader on it has already seen: a Task's own
    /// Chat for a message in a Task, else the Channel or DM.
    public let chatID: String
    /// The Channel or DM the conversation belongs to.
    public let conversationChatID: String
    public let messageID: String
    /// The Task whose Chat the message is in (ADR 0052); nil for a Channel or
    /// DM message.
    public let taskID: String?
    /// That Task's key, such as `SEC-12`, as it read when the push was sent.
    public let taskKey: String?

    public init(
        serverID: String,
        chatID: String,
        conversationChatID: String,
        messageID: String,
        taskID: String? = nil,
        taskKey: String? = nil
    ) {
        self.serverID = serverID
        self.chatID = chatID
        self.conversationChatID = conversationChatID
        self.messageID = messageID
        self.taskID = taskID
        self.taskKey = taskKey
    }

    /// Parses a notification's `userInfo`. Keys this build does not know are
    /// ignored. Nil when a required key is missing, so a malformed push opens
    /// nothing rather than the wrong conversation.
    ///
    /// A push sent before side conversations were deleted (ADR 0052) names a
    /// side conversation's own Chat as `chatId` beside its parent
    /// `conversationChatId`. That Chat is
    /// gone and its messages are inline replies in the parent, so the payload
    /// reads it as the parent Channel or DM (`PushNotificationRoute.opening`).
    public init?(userInfo: [AnyHashable: Any]) {
        guard let serverID = Self.string(userInfo["serverId"]),
              let chatID = Self.string(userInfo["chatId"]),
              let messageID = Self.string(userInfo["messageId"])
        else { return nil }
        let taskID = Self.string(userInfo["taskId"])
        let conversationChatID = Self.string(userInfo["conversationChatId"]) ?? chatID
        let route = PushNotificationRoute.opening(
            chatID: chatID,
            conversationChatID: conversationChatID,
            taskID: taskID
        )
        self.init(
            serverID: serverID,
            chatID: route.chatID,
            conversationChatID: conversationChatID,
            messageID: messageID,
            taskID: taskID,
            taskKey: taskID == nil ? nil : Self.string(userInfo["taskKey"])
        )
    }

    /// Where a tap lands.
    public var route: PushNotificationRoute {
        .opening(chatID: chatID, conversationChatID: conversationChatID, taskID: taskID)
    }

    private static func string(_ value: Any?) -> String? {
        guard let value = value as? String, !value.isEmpty else { return nil }
        return value
    }
}

/// The screen a tapped notification or a deep link opens: a DM or Channel on
/// the canvas, or a Task pushed over it.
public enum PushNotificationRoute: Sendable, Equatable {
    case chat(chatID: String)
    /// A message in a Task: the Task screen, whose Chat is `chatID`.
    case task(taskID: String, chatID: String)

    /// The one rule from a push's ids to a screen. A Task opens as its Task.
    /// Anything else opens its conversation, the Channel or DM: for an
    /// ordinary message that is its own Chat, and for one that names a side
    /// conversation's Chat (a push from before ADR 0052) it is the parent the
    /// conversation now lives in as inline replies.
    public static func opening(chatID: String, conversationChatID: String, taskID: String?) -> Self {
        if let taskID { return .task(taskID: taskID, chatID: chatID) }
        return .chat(chatID: conversationChatID)
    }

    /// The Chat this route puts on screen.
    public var chatID: String {
        switch self {
        case let .chat(chatID), let .task(_, chatID): chatID
        }
    }
}

/// What a notification arriving while Haus is frontmost does.
public enum PushForegroundPresentation: Sendable, Equatable {
    /// The reader is already looking at the conversation; the message is on
    /// screen, so a banner would only repeat it.
    case suppress
    case banner

    /// - Parameters:
    ///   - viewingServerID: the Server the app is showing.
    ///   - viewingChatID: the Chat on screen right now — a pushed Task's own
    ///     Chat, or the canvas Chat — and nil when the Inbox, a read-only
    ///     Task, or nothing is showing.
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
