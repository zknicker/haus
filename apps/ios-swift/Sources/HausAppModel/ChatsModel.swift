import HausModels
import Observation

/// What a Chat-list write changed, for the composition root's memoized
/// projections and launch snapshot.
public enum ChatsChange: Equatable, Sendable {
    case chatList([ChatSummary])
    case receiptBackedDMs
}

/// The Server's Chat list: Projects, `#all`, and DMs (Channels and DMs on the
/// wire), with the unread state the Inbox and dots read. Transcripts live in
/// the shared `TranscriptStore` the composition root owns.
@MainActor
@Observable
public final class ChatsModel {
    private var storedChats: [ChatSummary] = []
    private var storedReceiptBackedAgentDMs: [String: String] = [:]
    /// Whether the Chat list has landed once, so unread stays silent until it
    /// can answer honestly.
    public private(set) var hasLoadedChats = false
    /// Mark read presses still settling, by Chat id and the sequence each
    /// covered. A Chat stays hidden until the Server answers unless a newer
    /// message arrives first (`UnreadChats.isUnread`).
    public var markedReadThrough: [String: Int] = [:]

    /// Called after each write that changes the list or the DM receipts.
    @ObservationIgnored public var onChange: @MainActor (ChatsChange) -> Void = { _ in }

    public init() {}

    /// Listed conversations only. Equal writes are dropped: Observation
    /// reports them as changes, and every event path refetches lists that
    /// usually come back byte-identical.
    public var chats: [ChatSummary] {
        get { storedChats }
        set {
            if !hasLoadedChats { hasLoadedChats = true }
            let listed = newValue.filter(\.kind.isListedConversation)
            guard storedChats != listed else { return }
            storedChats = listed
            onChange(.chatList(listed))
        }
    }

    /// Captain DMs the Server has materialized but the Chat list has not
    /// caught up to, by Chat id.
    public var receiptBackedAgentDMsByChatID: [String: String] {
        get { storedReceiptBackedAgentDMs }
        set {
            guard storedReceiptBackedAgentDMs != newValue else { return }
            storedReceiptBackedAgentDMs = newValue
            onChange(.receiptBackedDMs)
        }
    }

    /// The Chats the Inbox lists as unread, less any Mark read still
    /// settling. Nil until the Chat list has landed.
    public var unreadChats: [ChatSummary]? {
        guard hasLoadedChats else { return nil }
        return UnreadChats.visible(chats, markedReadThrough: markedReadThrough)
    }

    /// A Server switch or membership loss: the list is unknown again, not
    /// empty.
    public func reset() {
        if !storedChats.isEmpty {
            storedChats = []
            onChange(.chatList([]))
        }
        receiptBackedAgentDMsByChatID = [:]
        markedReadThrough = [:]
        hasLoadedChats = false
    }
}
