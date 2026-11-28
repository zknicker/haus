import Foundation

/// The Haus keys a message push carries beside the standard `aps` dictionary.
public struct PushNotificationPayload: Sendable, Equatable {
    public let serverID: String
    public let chatID: String
    public let conversationChatID: String
    public let messageID: String
    public let taskID: String?
    public let taskShortID: String?
    /// `conversation.kind`: whether the message is in a Channel, a DM, or a
    /// Captain chat.
    public let conversationKind: PushConversationKind?

    public init(
        serverID: String,
        chatID: String,
        conversationChatID: String,
        messageID: String,
        taskID: String? = nil,
        taskShortID: String? = nil,
        conversationKind: PushConversationKind? = nil
    ) {
        self.serverID = serverID
        self.chatID = chatID
        self.conversationChatID = conversationChatID
        self.messageID = messageID
        self.taskID = taskID
        self.taskShortID = taskShortID
        self.conversationKind = conversationKind
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
            taskShortID: taskID == nil ? nil : Self.string(userInfo["taskShortId"]),
            conversationKind: (userInfo["conversation"] as? [String: Any])
                .flatMap { Self.string($0["kind"]) }
                .flatMap(PushConversationKind.init(rawValue:))
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

public enum PushConversationKind: String, Sendable, Equatable {
    case channel
    case dm
    case captain
}

/// An Issue push: an assignment to the person, or a comment on an Issue they
/// subscribe to. The iPhone has no Issue screen, so a tap opens the Server.
public struct PushIssue: Sendable, Equatable {
    public enum Kind: String, Sendable, Equatable {
        case assignment = "issue_assignment"
        case comment = "issue_comment"
    }

    public let serverID: String
    public let issueID: String
    public let code: String
    public let kind: Kind

    public init?(userInfo: [AnyHashable: Any]) {
        guard let kind = (userInfo["kind"] as? String).flatMap(Kind.init(rawValue:)),
              let serverID = PushUserInfo.id(userInfo["serverId"]),
              let issueID = PushUserInfo.id(userInfo["issueId"]),
              let code = PushUserInfo.id(userInfo["code"])
        else { return nil }
        self.serverID = serverID
        self.issueID = issueID
        self.code = code
        self.kind = kind
    }
}

public enum HausPush: Sendable, Equatable {
    case message(PushNotificationPayload)
    case issue(PushIssue)

    public init?(userInfo: [AnyHashable: Any]) {
        switch userInfo["kind"] as? String {
        case PushIssue.Kind.assignment.rawValue, PushIssue.Kind.comment.rawValue:
            guard let push = PushIssue(userInfo: userInfo) else { return nil }
            self = .issue(push)
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
        case let .issue(push): push.serverID
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
        viewingChatIDs: Set<String>
    ) -> PushForegroundPresentation {
        guard let payload,
              payload.serverID == viewingServerID,
              viewingChatIDs.contains(payload.chatID)
        else { return .banner }
        return .suppress
    }
}
