import ClerkKit
import Foundation
import HausModels
import HausTransport
import HausUI
import Observation
import OSLog

@MainActor
@Observable
final class HausStore {
    static let logger = Logger(subsystem: "chat.haus.ios", category: "server")
    // Internal so the launch can live in `HausStoreServerReload.swift`.
    var state: State = .idle
    var isConnected = false
    // Internal so the batched snapshot apply can live with the rest of the
    // realtime plumbing.
    var servers: [ServerSummary] = []
    // Internal so the app-only computer loader can live in its own file.
    var computers: [ComputerSummary]?
    var mentionOptionsByDestinationID: [ChatDestination.ID: [MentionOptionPresentation]] = [:]
    var currentActivityByAgentID: [String: AgentActivityEvent] = [:] {
        didSet {
            // One bit for the sidebar's Haus mark, so the shell subscribes to
            // that rather than to a dictionary `agent.onActivity` rewrites on
            // every tool call.
            let working = !currentActivityByAgentID.isEmpty
            if isAnyAgentWorking != working { isAnyAgentWorking = working }
        }
    }
    /// Whether any Agent on the active Server is working right now, and whether
    /// the Server has answered that question at all yet. Until it has, the
    /// answer is "no" rather than a guess — see `HausGhostTempo.resolve`.
    private(set) var isAnyAgentWorking = false
    var hasAgentActivitySnapshot = false
    var currentActivityPositionByRunID: [String: Int] = [:]
    var lifecycleRevision = 0
    // Everything the memoized Chat projections read is stored here and
    // published through the accessors under "Projected Server state" below.
    private var storedAgents: [AgentSummary] = []
    private var storedMembers: MemberList?
    private var storedChats: [ChatSummary] = []
    private var storedReceiptBackedAgentDMsByChatID: [String: String] = [:]
    private var storedMessagesByChatID: [String: ChatMessagePage] = [:]
    /// Inline reply pages are filtered Server reads, so they stay separate from
    /// the ordinary Chat history page they came from.
    var inlineReplyPagesByRootID: [String: ChatMessagePage] = [:]
    var inlineReplyChatIDByRootID: [String: String] = [:]
    var inlineReplyCacheGeneration = 0
    var inlineReplyLoadsInFlight: Set<String> = []
    // MARK: - Inbox snapshots
    //
    // The Server-wide reads the Inbox stands on, loaded and refreshed by
    // `HausStoreInbox.swift`. Each stays nil until its first load, which is
    // what lets a durable event refresh only what this client actually holds.
    /// Inbox Mark read presses still settling, by Chat id and the sequence
    /// each covered. A Chat stays hidden until the Server answers unless a
    /// newer message arrives first (`UnreadChats.isUnread`).
    var markedReadThrough: [String: Int] = [:]
    /// Whether the Chat list has landed once, so the unread count stays silent
    /// until it can answer honestly.
    private(set) var hasLoadedChats = false
    /// The app icon badge: unread Chats across every Server, as the Server
    /// counts them for push. Nil until first read (`HausStoreIconBadge.swift`).
    var iconBadgeCount: Int?
    /// The Server-wide default Task lens (`task.list`), which the Task list
    /// reads and durable task events refresh.
    var serverTasks: [TaskListItem]?
    var activeCloudAgentWork: [ActiveCloudAgentWork]?
    var serverUsage: ServerUsageSnapshot?
    /// How many background-tier tasks the Server-wide Task lens last hid. Zero
    /// whenever the last Server-wide read already widened the lens, which is
    /// what `task.list` reports for it.
    var taskBackgroundCount = 0
    var cloudAgentWorkByChatID: [String: [ThreadCloudAgentWork]] = [:] {
        didSet {
            guard oldValue != cloudAgentWorkByChatID else { return }
            projections.retireMessages(chatIDs: KeyedChanges.between(oldValue, cloudAgentWorkByChatID))
        }
    }
    private var storedPendingMessagesByChatID: [String: [PendingChatMessage]] = [:]
    private var storedLifecycleAvailability: [String: AgentAvailability] = [:]
    /// The sidebar's row order, frozen while the drawer is open so a new
    /// message cannot move a row under the reader's finger. See
    /// `holdSidebarOrder()`.
    var sidebarOrder = HeldOrder<ChatDestination.ID>() {
        didSet {
            if oldValue != sidebarOrder { projections.chatDestinations = nil }
        }
    }
    var sendError: String?
    var chatEventServerID: String?
    var chatEventReplay = ChatEventReplayState()
    @ObservationIgnored lazy var reactionStickers = Self.makeReactionStickerBoard { [weak self] in self }
    // Stream recovery (`HausStoreEventStreams.swift`).
    @ObservationIgnored var streamRestart: Task<Void, Never>?
    @ObservationIgnored var streamRestartAttempt = 0
    @ObservationIgnored var streamsStartedAt: Date?
    @ObservationIgnored var streamsHealthy = false
    /// When the app last left the foreground, so a quick return can skip the
    /// full snapshot while its streams are still up.
    @ObservationIgnored var backgroundedAt: Date?
    @ObservationIgnored var chatListRefresh: Task<Void, Never>?
    // Launch (`HausStoreServerReload.swift`, `HausStoreLaunchSnapshot.swift`).
    /// Whether a live load has replaced whatever the launch painted from disk.
    @ObservationIgnored var hasLiveServerState = false
    @ObservationIgnored var launchRetry: Task<Void, Never>?
    @ObservationIgnored var launchSnapshotWrite: Task<Void, Never>?
    let launchSnapshots = LaunchSnapshotStore.applicationSupport()
    @ObservationIgnored var chatListRefreshAgain = false
    var chatEventCatchUpInFlight = false
    var chatEventCatchUpPending = false
    /// The deepest Chat surface on the user's stack, and the only Chat that
    /// acknowledges reads: it is what the user is actually looking at.
    var openChatID: String?
    /// The Chat the shell canvas is showing, whether or not a pushed route
    /// covers it. A covered canvas is still a surface the user will return to,
    /// so its page has to stay fresh — but it never acknowledges reads, which
    /// stay with `openChatID`.
    var canvasChatID: String?
    /// Memoized Chat projections. Cache writes must stay invisible to
    /// Observation: a projection read happens inside a view body, and a tracked
    /// write there would invalidate the body that just performed it.
    @ObservationIgnored var projections = ChatProjectionCaches()
    /// What each Chat has shown the reader, what Server has confirmed, and what
    /// is in flight. Observation-ignored: no view reads it, and a read
    /// acknowledgement must not repaint the app.
    @ObservationIgnored var chatReads = ChatReadLedger()
    /// Whether the app is frontmost. A transcript on a backgrounded phone is
    /// not being read, so nothing acknowledges until it returns.
    @ObservationIgnored var isForegrounded = true
    var historyLoadsInFlight: Set<String> = []
    @ObservationIgnored var historyNavigation = ChatHistoryNavigationState()
    /// Live SSE events accumulate here for one short window before the existing
    /// batch applier runs; the catch-up walk already arrives batched.
    @ObservationIgnored var liveChatEvents = ChatEventCoalescer()
    @ObservationIgnored var liveChatEventFlush: Task<Void, Never>?
    /// Recovery state invalidates mounted Chat reads when an Agent message has
    /// committed and supplies the revision that mounted Server search observes.
    @ObservationIgnored var agentMessageRecovery = AgentMessageRecoveryState()
    var agentMessageSearchRevision = 0
    // Internal so the foreground refresh can live with the rest of the
    // realtime plumbing it drives.
    var foregroundRefreshInFlight = false
    /// The Chat the App wants warm first — its restored last-open Chat — so
    /// the initial page load readies the screen the user actually lands on.
    var preferredInitialChatID: String?
    let clerk: Clerk
    let client: TRPCClient
    /// Downloaded attachment bytes are app cache state, like every other
    /// snapshot the Store holds; the transport stays a pure transfer boundary.
    let attachmentFiles = AttachmentFileCache()
    nonisolated let eventTasks = EventTaskBag()

    init(clerk: Clerk) {
        self.clerk = clerk
        let config = AppConfig(
            serverOrigin: HausRuntimeConfiguration.serverOrigin,
            productVersion: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.1.0"
        )
        client = TRPCClient(
            config: config,
            sessionTokenProvider: ClerkSessionTokenProvider(clerk: clerk),
            decoder: HausJSON.decoder()
        )
    }

    deinit {
        eventTasks.cancelAll()
    }

    var activeServer: ServerSummary? { servers.first }

    /// Observation notifies on equal-value writes, so the event paths must not
    /// restate a connection they already have: doing so invalidated the root
    /// body once per SSE frame. `markDisconnected` is the same rule for the
    /// paths that observe an outage.
    func markConnected() {
        if !isConnected { isConnected = true }
    }

    func markDisconnected() {
        if isConnected { isConnected = false }
    }

    // MARK: - Projected Server state
    //
    // The Chat projections are memoized, and these fields are their inputs. Each
    // one is stored privately and published through the accessor below it, so
    // the invalidation contract holds structurally rather than by convention: a
    // write cannot reach this state without passing through a setter that
    // retires the projections that field feeds.
    //
    // The setters also drop equal-value writes. Observation reports those as
    // changes, and every event path here refetches lists that usually come back
    // byte-identical.

    /// Names, avatars, and presence for every Agent-authored row, mention, and
    /// sidebar entry, so an Agent write retires both projections.
    var agents: [AgentSummary] {
        get { storedAgents }
        set {
            guard storedAgents != newValue else { return }
            storedAgents = newValue
            scheduleLaunchSnapshotWrite()
            projections.retireAgents(newValue)
        }
    }

    /// Names and avatars for human authors, mentions, and human DMs.
    var members: MemberList? {
        get { storedMembers }
        set {
            guard storedMembers != newValue else { return }
            storedMembers = newValue
            scheduleLaunchSnapshotWrite()
            projections.retireMembers(newValue?.members ?? [])
        }
    }

    /// The live presence overlay. It reaches message rows through the author's
    /// presence dot and sidebar rows through the Agent's, so it counts as part
    /// of the directory.
    var lifecycleAvailability: [String: AgentAvailability] {
        get { storedLifecycleAvailability }
        set {
            guard storedLifecycleAvailability != newValue else { return }
            storedLifecycleAvailability = newValue
            projections.retirePresence()
        }
    }

    var chats: [ChatSummary] {
        get { storedChats }
        set {
            if !hasLoadedChats { hasLoadedChats = true }
            guard storedChats != newValue else { return }
            storedChats = newValue
            scheduleLaunchSnapshotWrite()
            projections.retireChatList(newValue)
        }
    }

    /// Agent DMs Server has materialized but the Chat list has not caught up to.
    var receiptBackedAgentDMsByChatID: [String: String] {
        get { storedReceiptBackedAgentDMsByChatID }
        set {
            guard storedReceiptBackedAgentDMsByChatID != newValue else { return }
            storedReceiptBackedAgentDMsByChatID = newValue
            projections.chatDestinations = nil
        }
    }

    var messagesByChatID: [String: ChatMessagePage] {
        get { storedMessagesByChatID }
        set {
            let changed = KeyedChanges.between(storedMessagesByChatID, newValue)
            guard !changed.isEmpty else { return }
            storedMessagesByChatID = newValue
            scheduleLaunchSnapshotWrite()
            // A Thread's rows resolve cloud-agent conversation links through
            // its parent's page, so loaded Threads (pages the Chat list does
            // not name) follow any page write.
            let listedChatIDs = Set(storedChats.map(\.id))
            let threadChatIDs = newValue.keys.filter { !listedChatIDs.contains($0) }
            projections.retireMessages(chatIDs: changed.union(threadChatIDs))
        }
    }

    var pendingMessagesByChatID: [String: [PendingChatMessage]] {
        get { storedPendingMessagesByChatID }
        set {
            let changed = KeyedChanges.between(storedPendingMessagesByChatID, newValue)
            guard !changed.isEmpty else { return }
            storedPendingMessagesByChatID = newValue
            projections.retireMessages(chatIDs: changed)
        }
    }
}
