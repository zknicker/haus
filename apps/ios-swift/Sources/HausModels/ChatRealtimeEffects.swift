import Foundation

/// A message entity to read again: the message and the Chat it lives in.
public struct EntityRefresh: Hashable, Sendable {
    public let chatID: String
    public let messageID: String

    public init(chatID: String, messageID: String) {
        self.chatID = chatID
        self.messageID = messageID
    }
}

/// What one coalesced batch of live Chat events asks the Store to read.
///
/// Each event kind has its own small handler that only records reads; the
/// Store executes the union once, so a burst costs one tail read per list, one
/// read per changed message, and one Chat list read.
public struct ChatRealtimeEffects: Sendable, Equatable {
    /// Chats whose loaded lists need a tail read, with the highest event
    /// sequence seen for each.
    public private(set) var tailSequenceByChatID: [String: Int] = [:]
    public private(set) var entityRefreshes: Set<EntityRefresh> = []
    public private(set) var reloadsChatList = false
    /// Chats whose read moved; the Chat list read is skipped when it already
    /// shows each of them with nothing unread.
    public private(set) var readChatIDs: Set<String> = []
    /// A Thread's read moved. It never changes its parent's count (ADR 0043),
    /// so it reads the unread Threads alone. Every other Thread signal —
    /// a reply, a follow, a parent's lifecycle — already reads the Chat list,
    /// which reads the unread Threads beside it.
    public private(set) var reloadsUnreadThreads = false
    public private(set) var reloadsServerTasks = false
    public private(set) var reloadsActiveCloudAgentWork = false
    public private(set) var cloudAgentWorkChatIDs: Set<String> = []
    public private(set) var changedLabelIDs: Set<String> = []
    public private(set) var deletedChatIDs: Set<String> = []
    /// Messages whose reactions changed live, for the sticker arrival motion.
    public private(set) var liveReactionMessageIDs: Set<String> = []

    public init() {}

    public init(_ events: [ChatRealtimeEvent], serverID: String) {
        for event in events where event.serverID == serverID {
            absorb(event)
        }
    }

    public var isEmpty: Bool { self == ChatRealtimeEffects() }

    public mutating func absorb(_ event: ChatRealtimeEvent) {
        switch event {
        case let .messageCreated(event): absorb(messageCreated: event)
        case let .reactionUpdated(event): absorb(reactionUpdated: event)
        case let .read(event): absorb(read: event)
        case let .threadFollowUpdated(event): absorb(threadFollow: event)
        case let .lifecycle(event): absorb(lifecycle: event)
        case let .taskChanged(event): absorb(taskChanged: event)
        case let .taskLabelUpdated(event): absorb(taskLabel: event)
        case let .cloudAgentWorkUpdated(event): absorb(cloudAgentWork: event)
        }
    }

    // MARK: - Per-event handlers

    /// A new message: tail-read the Chat's lists; a Thread reply also changes
    /// its parent anchor's summary.
    mutating func absorb(messageCreated event: MessageCreatedEvent) {
        tailSequenceByChatID[event.chatID] = max(tailSequenceByChatID[event.chatID] ?? 0, event.sequence)
        if let parentChatID = event.parentChatID, let anchorID = event.threadAnchorMessageID {
            entityRefreshes.insert(EntityRefresh(chatID: parentChatID, messageID: anchorID))
        }
        reloadsChatList = true
    }

    mutating func absorb(reactionUpdated event: MessageReactionUpdatedEvent) {
        entityRefreshes.insert(EntityRefresh(chatID: event.chatID, messageID: event.messageID))
        liveReactionMessageIDs.insert(event.messageID)
    }

    /// A Chat read moves the Chat list's count. A Thread read moves the
    /// Thread's own row and its anchor summary's "N new", never the parent.
    mutating func absorb(read event: ChatReadEvent) {
        guard let parentChatID = event.parentChatID else {
            readChatIDs.insert(event.chatID)
            return
        }
        reloadsUnreadThreads = true
        if let anchorID = event.threadAnchorMessageID {
            entityRefreshes.insert(EntityRefresh(chatID: parentChatID, messageID: anchorID))
        }
    }

    mutating func absorb(threadFollow event: ThreadFollowUpdatedEvent) {
        entityRefreshes.insert(EntityRefresh(chatID: event.parentChatID, messageID: event.anchorMessageID))
        reloadsChatList = true
    }

    mutating func absorb(lifecycle event: ChatLifecycleEvent) {
        if event.action == .deleted {
            deletedChatIDs.insert(event.chatID)
        }
        reloadsChatList = true
    }

    mutating func absorb(taskChanged event: TaskChangedEvent) {
        entityRefreshes.insert(EntityRefresh(chatID: event.chatID, messageID: event.messageID))
        reloadsServerTasks = true
    }

    mutating func absorb(taskLabel event: TaskLabelUpdatedEvent) {
        changedLabelIDs.insert(event.labelID)
        reloadsServerTasks = true
    }

    mutating func absorb(cloudAgentWork event: CloudAgentWorkUpdatedEvent) {
        entityRefreshes.insert(EntityRefresh(chatID: event.chatID, messageID: event.messageID))
        cloudAgentWorkChatIDs.insert(event.chatID)
        if let parentChatID = event.parentChatID {
            cloudAgentWorkChatIDs.insert(parentChatID)
        }
        reloadsActiveCloudAgentWork = true
    }

    /// Whether the batch needs a Chat list read, given what the settled list
    /// says each read Chat has unread.
    public func needsChatListRead(unreadCount: (String) -> Int?) -> Bool {
        if reloadsChatList { return true }
        return readChatIDs.contains { (unreadCount($0) ?? 1) > 0 }
    }
}
