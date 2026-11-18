import Foundation

/// The Haus keys a message push carries beside the standard `aps` dictionary.
public struct PushNotificationPayload: Sendable, Equatable {
    public let serverID: String
    public let chatID: String
    public let conversationChatID: String
    public let messageID: String
    public let taskID: String?
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

    ///
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

public enum PushNotificationRoute: Sendable, Equatable {
    case chat(chatID: String)
    case task(taskID: String, chatID: String)

    public static func opening(chatID: String, conversationChatID: String, taskID: String?) -> Self {
        if let taskID { return .task(taskID: taskID, chatID: chatID) }
        return .chat(chatID: conversationChatID)
    }

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
