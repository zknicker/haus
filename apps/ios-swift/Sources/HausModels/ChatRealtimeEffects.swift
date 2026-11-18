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
    public private(set) var reloadsActiveCloudAgentWork = false
    public private(set) var cloudAgentWorkChatIDs: Set<String> = []
    public private(set) var cloudAgentWorkIDs: Set<String> = []
    public private(set) var changedLabelIDs: Set<String> = []
    public private(set) var changedTaskIDs: Set<String> = []
    public private(set) var taskIDsToRefreshPreview: Set<String> = []
    public private(set) var reloadsUnreadTasks = false
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
        case let .lifecycle(event): absorb(lifecycle: event)
        case let .claimChanged(event): absorb(claimChanged: event)
        case let .taskLabelUpdated(event): absorb(taskLabel: event)
        case let .cloudAgentWorkUpdated(event): absorb(cloudAgentWork: event)
        case let .taskChanged(event): absorb(taskChanged: event)
        case let .taskFollowUpdated(event): absorb(taskFollow: event)
        }
    }

    // MARK: - Per-event handlers

    mutating func absorb(messageCreated event: MessageCreatedEvent) {
        tailSequenceByChatID[event.chatID] = max(tailSequenceByChatID[event.chatID] ?? 0, event.sequence)
        if let taskID = event.taskID {
            taskIDsToRefreshPreview.insert(taskID)
            reloadsUnreadTasks = true
        }
        reloadsChatList = true
    }

    mutating func absorb(reactionUpdated event: MessageReactionUpdatedEvent) {
        entityRefreshes.insert(EntityRefresh(chatID: event.chatID, messageID: event.messageID))
        liveReactionMessageIDs.insert(event.messageID)
    }

    mutating func absorb(read event: ChatReadEvent) {
        if let taskID = event.taskID {
            taskIDsToRefreshPreview.insert(taskID)
            reloadsUnreadTasks = true
            return
        }
        readChatIDs.insert(event.chatID)
    }

    /// A deleted Chat takes its links with it: work it linked may leave
    /// "Happening now" or open somewhere else, so that list reads again.
    mutating func absorb(lifecycle event: ChatLifecycleEvent) {
        if event.action == .deleted {
            deletedChatIDs.insert(event.chatID)
            reloadsActiveCloudAgentWork = true
        }
        reloadsChatList = true
    }

    mutating func absorb(claimChanged event: ClaimChangedEvent) {
        entityRefreshes.insert(EntityRefresh(chatID: event.chatID, messageID: event.messageID))
    }

    mutating func absorb(taskLabel event: TaskLabelUpdatedEvent) {
        changedLabelIDs.insert(event.labelID)
    }

    mutating func absorb(taskChanged event: TaskChangedEvent) {
        changedTaskIDs.insert(event.taskID)
        taskIDsToRefreshPreview.insert(event.taskID)
        reloadsUnreadTasks = true
    }

    mutating func absorb(taskFollow event: TaskFollowUpdatedEvent) {
        changedTaskIDs.insert(event.taskID)
        taskIDsToRefreshPreview.insert(event.taskID)
        reloadsUnreadTasks = true
    }

    mutating func absorb(cloudAgentWork event: CloudAgentWorkUpdatedEvent) {
        entityRefreshes.insert(EntityRefresh(chatID: event.chatID, messageID: event.messageID))
        cloudAgentWorkIDs.insert(event.workID)
        cloudAgentWorkChatIDs.insert(event.chatID)
        reloadsActiveCloudAgentWork = true
    }

    /// Whether the batch needs a Chat list read, given what the settled list
    /// says each read Chat has unread.
    public func needsChatListRead(unreadCount: (String) -> Int?) -> Bool {
        if reloadsChatList { return true }
        return readChatIDs.contains { (unreadCount($0) ?? 1) > 0 }
    }
}
