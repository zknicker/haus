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

public struct PushTaskAssignment: Sendable, Equatable {
    public let serverID: String
    public let taskID: String
    public let key: String

    public init?(userInfo: [AnyHashable: Any]) {
        guard userInfo["kind"] as? String == "task_assignment",
              let serverID = PushUserInfo.id(userInfo["serverId"]),
              let taskID = PushUserInfo.id(userInfo["taskId"]),
              let key = (userInfo["key"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
              key.wholeMatch(of: /[A-Z][A-Z0-9]{1,4}-[1-9][0-9]*/) != nil
        else { return nil }
        self.serverID = serverID
        self.taskID = taskID
        self.key = key
    }
}

public struct PushTaskAssignmentBurst: Sendable, Equatable {
    public let serverID: String
    public let count: Int

    public init?(userInfo: [AnyHashable: Any]) {
        guard userInfo["kind"] as? String == "task_assignment_burst",
              let serverID = PushUserInfo.id(userInfo["serverId"]),
              let count = PushUserInfo.integer(userInfo["count"]),
              count >= 2
        else { return nil }
        self.serverID = serverID
        self.count = count
    }
}

public enum HausPush: Sendable, Equatable {
    case message(PushNotificationPayload)
    case taskAssignment(PushTaskAssignment)
    case taskAssignmentBurst(PushTaskAssignmentBurst)

    public init?(userInfo: [AnyHashable: Any]) {
        switch userInfo["kind"] as? String {
        case "task_assignment":
            guard let push = PushTaskAssignment(userInfo: userInfo) else { return nil }
            self = .taskAssignment(push)
        case "task_assignment_burst":
            guard let push = PushTaskAssignmentBurst(userInfo: userInfo) else { return nil }
            self = .taskAssignmentBurst(push)
        case nil:
            guard let push = PushNotificationPayload(userInfo: userInfo) else { return nil }
            self = .message(push)
        default:
            return nil
        }
    }

    public var serverID: String {
        switch self {
        case let .message(push): push.serverID
        case let .taskAssignment(push): push.serverID
        case let .taskAssignmentBurst(push): push.serverID
        }
    }
}

enum PushUserInfo {
    static func id(_ value: Any?) -> String? {
        guard let value = (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty
        else { return nil }
        return value
    }

    static func integer(_ value: Any?) -> Int? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        let integer = number.intValue
        return Double(integer) == number.doubleValue ? integer : nil
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
