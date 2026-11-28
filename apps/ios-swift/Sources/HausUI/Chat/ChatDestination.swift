import Foundation

public struct HumanPresentation: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let handle: String?
    public let avatarURL: URL?

    public init(id: String, name: String, handle: String?, avatarURL: URL?) {
        self.id = id
        self.name = name
        self.handle = handle
        self.avatarURL = avatarURL
    }
}

/// Navigation is broader than persistence: a Captain can be opened before
/// the Chat list holds its chat. Only `durableChat` carries a Server Chat id.
public enum ChatDestination: Identifiable, Hashable, Sendable {
    case durableChat(ChatPresentation)
    case implicitCaptainChat(AgentPresentation)

    public enum ID: Hashable, Sendable {
        case chat(String)
        case captain(String)
    }

    public var id: ID {
        switch self {
        case .durableChat(let chat): .chat(chat.id)
        case .implicitCaptainChat(let agent): .captain(agent.id)
        }
    }

    public var title: String {
        switch self {
        case .durableChat(let chat): chat.title
        case .implicitCaptainChat(let agent): agent.name
        }
    }

    public var kind: ChatKind {
        switch self {
        case .durableChat(let chat): chat.kind
        case .implicitCaptainChat(let agent): .captainChat(agent)
        }
    }

    public var unreadCount: Int {
        switch self {
        case .durableChat(let chat): chat.unreadCount
        case .implicitCaptainChat: 0
        }
    }

    public var appearance: ChannelAppearance {
        switch self {
        case .durableChat(let chat): chat.appearance
        case .implicitCaptainChat: .default
        }
    }

    public var durableChat: ChatPresentation? {
        guard case .durableChat(let chat) = self else { return nil }
        return chat
    }

    public var pendingKey: String {
        switch id {
        case .chat(let id): id
        case .captain(let id): "captain:\(id)"
        }
    }
}

public extension Collection<ChatDestination> {
    /// A Captain's chat, which is where the phone shows a Captain's profile:
    /// a Chat's details sheet pushes the profile of the Captain it belongs to.
    /// Every Captain the Server reports carries a destination — durable,
    /// receipt-backed, or implicit — so a miss means the Captain is gone and
    /// the caller has nowhere to go.
    func agentDestination(agentID: String) -> ChatDestination? {
        first { destination in
            guard case .captainChat(let agent) = destination.kind else { return false }
            return agent.id == agentID
        }
    }
}

/// The last-open Chat survives launches as a defaults string, so the app opens
/// into the conversation the user left rather than the top of the Chat list.
/// A stored id the Server list no longer carries falls back to the first Chat
/// through the shell's ordinary selection sync.
extension ChatDestination.ID {
    public static let lastOpenDefaultsKey = "lastOpenChatDestination"

    public var storageValue: String {
        switch self {
        case .chat(let id): "chat:\(id)"
        case .captain(let id): "captain:\(id)"
        }
    }

    public init?(storageValue: String) {
        if storageValue.hasPrefix("chat:") {
            self = .chat(String(storageValue.dropFirst("chat:".count)))
        } else if storageValue.hasPrefix("captain:") {
            self = .captain(String(storageValue.dropFirst("captain:".count)))
        } else {
            return nil
        }
    }
}
