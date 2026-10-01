import Foundation

/// Who sent a pushed message and where, so the Notification Service extension
/// can present it as a communication notification: the sender's avatar with
/// the Haus icon as a corner badge.
///
/// Nil when the push predates the contract or a key is malformed; the
/// extension then delivers the plain banner unchanged.
public struct PushNotificationCommunication: Sendable, Equatable {
    public let sender: Sender
    public let conversation: Conversation
    /// Groups donated interactions per conversation: the Channel or DM.
    public let conversationIdentifier: String
    /// Why the message addresses the viewer; nil for a push that predates it
    /// or an unknown value.
    public let reason: Reason?

    /// Why the Server pushed this message to the viewer.
    public enum Reason: String, Sendable, Equatable {
        case dm
        case mention
        case reply
    }

    /// What the donated intent tells Focus about the message. iOS lets a
    /// Channel message through a Focus only when it mentions or replies to the
    /// viewer; a DM breaks through by sender, so it needs no signal.
    public struct FocusSignals: Sendable, Equatable {
        public let mentionsCurrentUser: Bool
        public let isReplyToCurrentUser: Bool
    }

    /// Nil when the donation should keep iOS defaults: a DM or unknown reason.
    public var focusSignals: FocusSignals? {
        switch reason {
        case .mention:
            FocusSignals(mentionsCurrentUser: true, isReplyToCurrentUser: false)
        case .reply:
            FocusSignals(mentionsCurrentUser: false, isReplyToCurrentUser: true)
        case .dm, nil:
            nil
        }
    }

    public struct Sender: Sendable, Equatable {
        public enum Kind: String, Sendable, Equatable {
            case agent
            case human
        }

        public let id: String
        public let kind: Kind
        public let name: String
        /// Nil when the sender has no avatar or the URL is not one the
        /// extension may fetch.
        public let avatarURL: URL?

        public init(id: String, kind: Kind, name: String, avatarURL: URL?) {
            self.id = id
            self.kind = kind
            self.name = name
            self.avatarURL = avatarURL
        }

        /// The monogram shown when there is no avatar to fetch.
        public var initials: String {
            PushNotificationCommunication.initials(for: name)
        }
    }

    public enum Conversation: Sendable, Equatable {
        case dm
        /// The Channel's name without `#`; nil when the Server did not know it.
        case channel(name: String?)

        /// The group title iOS shows above the sender, `#name` for a Channel.
        public var groupName: String? {
            guard case let .channel(name?) = self else { return nil }
            return "#\(name)"
        }
    }

    public init(
        sender: Sender,
        conversation: Conversation,
        conversationIdentifier: String,
        reason: Reason? = nil
    ) {
        self.sender = sender
        self.conversation = conversation
        self.conversationIdentifier = conversationIdentifier
        self.reason = reason
    }

    public init?(userInfo: [AnyHashable: Any]) {
        guard let conversationIdentifier = Self.string(userInfo["conversationChatId"]),
              let senderInfo = userInfo["sender"] as? [String: Any],
              let conversationInfo = userInfo["conversation"] as? [String: Any],
              let id = Self.string(senderInfo["id"]),
              let kind = Self.string(senderInfo["kind"]).flatMap(Sender.Kind.init(rawValue:)),
              let name = Self.string(senderInfo["name"]),
              let conversation = Self.conversation(conversationInfo)
        else { return nil }
        self.init(
            sender: Sender(
                id: id,
                kind: kind,
                name: name,
                avatarURL: Self.string(senderInfo["avatarUrl"]).flatMap(Self.fetchableAvatarURL)
            ),
            conversation: conversation,
            conversationIdentifier: conversationIdentifier,
            reason: Self.string(userInfo["reason"]).flatMap(Reason.init(rawValue:))
        )
    }

    /// Avatars are fetched over HTTPS. Plain HTTP is allowed only for a local
    /// development Server, whose origin is loopback.
    public static func fetchableAvatarURL(_ raw: String) -> URL? {
        guard let url = URL(string: raw),
              let scheme = url.scheme?.lowercased(),
              let host = url.host(), !host.isEmpty
        else { return nil }
        switch scheme {
        case "https":
            return url
        case "http":
            return isLoopback(host) ? url : nil
        default:
            return nil
        }
    }

    /// Web's `getEntityInitials`: first and last word initials, or the first
    /// two letters of a single word.
    public static func initials(for name: String) -> String {
        let parts = name.split(whereSeparator: \.isWhitespace)
        guard let first = parts.first else { return "?" }
        guard parts.count > 1, let last = parts.last else {
            return String(first.prefix(2)).uppercased()
        }
        return "\(first.prefix(1))\(last.prefix(1))".uppercased()
    }

    private static func conversation(_ info: [String: Any]) -> Conversation? {
        switch info["kind"] as? String {
        case "dm":
            return .dm
        case "channel":
            return .channel(name: string(info["name"]))
        default:
            return nil
        }
    }

    private static func isLoopback(_ host: String) -> Bool {
        let host = host.lowercased()
        return host == "localhost" || host.hasSuffix(".localhost") || host == "127.0.0.1" || host == "::1"
    }

    private static func string(_ value: Any?) -> String? {
        guard let value = value as? String else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
