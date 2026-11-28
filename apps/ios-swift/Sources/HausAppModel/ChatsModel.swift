import HausModels
import Observation

/// What a Chat-list write changed, for the composition root's memoized
/// projections and launch snapshot.
public enum ChatsChange: Equatable, Sendable {
    case chatList([ChatSummary])
    case receiptBackedCaptainChats
}

/// The Server's Chat list: Projects, `#all`, DMs, and Captain chats, with the
/// unread state the Inbox and dots read. Transcripts live in
/// the shared `TranscriptStore` the composition root owns.
@MainActor
@Observable
public final class ChatsModel {
    private var storedChats: [ChatSummary] = []
    private var storedReceiptBackedCaptainChats: [String: String] = [:]
    /// Whether the Chat list has landed once, so unread stays silent until it
    /// can answer honestly.
    public private(set) var hasLoadedChats = false
    /// Mark read presses still settling, by Chat id and the sequence each
    /// covered. A Chat stays hidden until the Server answers unless a newer
    /// message arrives first (`UnreadChats.isUnread`).
    public var markedReadThrough: [String: Int] = [:]

    /// Called after each write that changes the list or the Captain chat receipts.
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

    /// Captain chats a send's receipt named but the Chat list has not caught
    /// up to, by Chat id.
    public var receiptBackedCaptainChatsByChatID: [String: String] {
        get { storedReceiptBackedCaptainChats }
        set {
            guard storedReceiptBackedCaptainChats != newValue else { return }
            storedReceiptBackedCaptainChats = newValue
            onChange(.receiptBackedCaptainChats)
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
        receiptBackedCaptainChatsByChatID = [:]
        markedReadThrough = [:]
        hasLoadedChats = false
    }
}
