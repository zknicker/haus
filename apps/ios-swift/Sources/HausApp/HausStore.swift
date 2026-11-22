import Foundation
import HausAppModel
import HausModels
import HausTransport
import HausUI
import Observation
import OSLog

/// The composition root: it owns the per-noun models in `HausAppModel`, the
/// transcripts they share, and the Chat projections views read. Each model
/// owns its reads and the events it applies; the extensions here wire them to
/// the realtime streams and to the views.
@MainActor
@Observable
final class HausStore {
    static let logger = Logger(subsystem: "chat.haus.ios", category: "server")
    var state: State = .idle
    var isConnected = false
    /// The viewer's Server list. Which one is active is `scope`'s, persisted
    /// by `lifecycle`, never list order.
    var servers: [ServerSummary] = []
    /// The Server the viewer was last removed from, so a surface can say why
    /// the app moved on. Nil until it happens.
    var lostServer: ServerSummary?
    var mentionOptionsByDestinationID: [ChatDestination.ID: [MentionOptionPresentation]] = [:]
    // MARK: - Models
    let scope: ServerScope
    let lifecycle: ServerLifecycle<ComposerInteraction>
    let chatList: ChatsModel
    let tasks: TasksModel
    let captains: CaptainsModel
    let workers: WorkersModel
    let drive: DriveModel
    let settingsModel: SettingsModel
    // Everything the memoized Chat projections read that no model owns yet is
    // stored here and published through the accessors under "Projected Server
    // state" below.
    private var storedMembers: MemberList?
    private var storedMessagesByChatID: [String: ChatMessagePage] = [:]
    // The normalized transcript cache and its targeted reads
    // (`HausStoreTranscripts.swift`). `messagesByChatID` and
    // `inlineReplyPagesByRootID` are its rendered pages.
    @ObservationIgnored var transcripts = TranscriptStore()
    @ObservationIgnored var transcriptReads = TranscriptReads()
    @ObservationIgnored var entityLoads: [String: EntityLoad] = [:]
    @ObservationIgnored var tailReadsInFlight: Set<TranscriptKey> = []
    @ObservationIgnored var deletedChatIDs: Set<String> = []
    @ObservationIgnored var staleEntities: Set<EntityRefresh> = []
    @ObservationIgnored var staleTranscriptChatIDs: Set<String> = []
    /// Inline reply pages are filtered Server reads, so they stay separate from
    /// the ordinary Chat history page they came from.
    private(set) var inlineReplyPagesByRootID: [String: ChatMessagePage] = [:]
    var inlineReplyChatIDByRootID: [String: String] = [:]
    var inlineReplyCacheGeneration = 0
    var inlineReplyLoadsInFlight: Set<String> = []
    /// (`HausStoreIconBadge.swift`).
    var iconBadgeCount: Int?
    var serverUsage: ServerUsageSnapshot?
    private var storedPendingMessagesByChatID: [String: [PendingChatMessage]] = [:]
    /// The sidebar's row order, frozen while the drawer is open so a new
    /// message cannot move a row under the reader's finger. See
    /// `holdSidebarOrder()`.
    var sidebarOrder = HeldOrder<ChatDestination.ID>() {
        didSet {
            if oldValue != sidebarOrder { projections.chatDestinations = nil }
        }
    }
    @ObservationIgnored lazy var reactionStickers = Self.makeReactionStickerBoard { [weak self] in self }
    // Realtime streams (`HausStoreEventStreams.swift`).
    @ObservationIgnored var realtimeServerID: String?
    @ObservationIgnored var streamRestarts = RealtimeStreamRestarts()
    @ObservationIgnored var streamRestartTasks: [RealtimeStream: Task<Void, Never>] = [:]
    @ObservationIgnored var recoveryFlush: Task<Void, Never>?
    @ObservationIgnored var membershipLossInFlight = false
    var streamsHealthy: Bool { realtimeServerID != nil && streamRestarts.allRunning }
    /// When the app last left the foreground, so a quick return can skip the
    /// full snapshot while its streams are still up.
    @ObservationIgnored var backgroundedAt: Date?
    @ObservationIgnored var chatListRefresh: Task<Void, Never>?
    // Launch (`HausStoreServerReload.swift`, `HausStoreLaunchSnapshot.swift`).
    /// Whether a live load has replaced whatever the launch painted from disk.
    @ObservationIgnored var hasLiveServerState = false
    @ObservationIgnored var launchRetry: Task<Void, Never>?
    @ObservationIgnored var launchSnapshotWrite: Task<Void, Never>?
    @ObservationIgnored var chatListRefreshAgain = false
    /// The deepest Chat surface on the user's stack, and the only Chat that
    /// acknowledges reads: it is what the user is actually looking at.
    var openChatID: String?
    /// The Chat the shell canvas is showing, whether or not a pushed route
    /// covers it. A covered canvas still has to stay fresh, but it never
    /// acknowledges reads, which stay with `openChatID`.
    var canvasChatID: String?
    /// Memoized Chat projections. Cache writes must stay invisible to
    /// Observation: a projection read happens inside a view body, and a tracked
    /// write there would invalidate the body that just performed it.
    @ObservationIgnored var projections = ChatProjectionCaches()
    /// Advances when a shared artifact chip's title lands (`HausStoreSharedArtifacts.swift`).
    var sharedArtifactRevision = 0
    /// What each Chat has shown the reader, what Server has confirmed, and what
    /// is in flight. Observation-ignored: a read acknowledgement must not
    /// repaint the app.
    @ObservationIgnored var chatReads = ChatReadLedger()
    /// Whether the app is frontmost. A transcript on a backgrounded phone is
    /// not being read, so nothing acknowledges until it returns.
    @ObservationIgnored var isForegrounded = true
    var historyLoadsInFlight: Set<String> = []
    @ObservationIgnored var historyNavigation = ChatHistoryNavigationState()
    /// Live Chat events from every focused stream accumulate here for one
    /// short window, so a burst costs one read fan-out.
    @ObservationIgnored var liveChatEvents = ChatEventCoalescer<ChatRealtimeEvent>()
    @ObservationIgnored var liveChatEventFlush: Task<Void, Never>?
    /// Advances when a new message lands, so mounted Server search reruns.
    var messageSearchRevision = 0
    var foregroundRefreshInFlight = false
    /// The Chat the App wants warm first — its restored last-open Chat — so
    /// the initial page load readies the screen the user actually lands on.
    var preferredInitialChatID: String?
    let authClient: NativeAuthClient
    let viewer: AppSessionUser
    let client: TRPCClient
    /// Downloaded attachment bytes are app cache state, like every other
    /// snapshot the Store holds; the transport stays a pure transfer boundary.
    let attachmentFiles = AttachmentFileCache()
    nonisolated let eventTasks = EventTaskBag()

    init(session: AppSession, authClient: NativeAuthClient) {
        self.authClient = authClient
        viewer = session.user
        let config = AppConfig(
            serverOrigin: HausRuntimeConfiguration.serverOrigin,
            productVersion: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.1.0"
        )
        let client = TRPCClient(
            config: config,
            sessionTokenProvider: HausSessionTokenProvider(authClient: authClient),
            decoder: HausJSON.decoder()
        )
        let scope = ServerScope()
        self.client = client
        self.scope = scope
        lifecycle = ServerLifecycle(
            userID: session.user.id,
            scope: scope,
            preference: ActiveServerPreference(userID: session.user.id),
            launchSnapshots: .applicationSupport(appProtocolVersion: HausAppProtocol.version),
            drafts: ComposerDraftStore(makeStaged: ComposerInteraction.init, discardStaged: { $0.cleanUp() })
        )
        chatList = ChatsModel()
        tasks = TasksModel(client: client, scope: scope)
        captains = CaptainsModel(client: client, scope: scope)
        workers = WorkersModel(client: client, scope: scope)
        drive = DriveModel(client: client, scope: scope)
        settingsModel = SettingsModel(client: client, scope: scope)
        connectModelChanges()
    }

    deinit {
        eventTasks.cancelAll()
    }

    // MARK: - Projected Server state
    //
    // The Chat projections are memoized, and these fields are their inputs.
    // Each is stored privately (or in a model that reports its writes through
    // `connectModelChanges`), so a write cannot reach this state without
    // retiring the projections that field feeds. The setters also drop
    // equal-value writes: Observation reports those as changes.

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

    /// Each Chat's rendered page, materialized from `transcripts`. Written only
    /// by `publishTranscripts`, which a transcript write calls.
    var messagesByChatID: [String: ChatMessagePage] { storedMessagesByChatID }

    func setMessagePages(_ newValue: [String: ChatMessagePage], inlinePages: [String: ChatMessagePage]) {
        if inlinePages != inlineReplyPagesByRootID { inlineReplyPagesByRootID = inlinePages }
        let changed = KeyedChanges.between(storedMessagesByChatID, newValue)
        guard !changed.isEmpty else { return }
        storedMessagesByChatID = newValue
        scheduleLaunchSnapshotWrite()
        projections.retireMessages(chatIDs: changed)
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

    private func connectModelChanges() {
        chatList.onChange = { [weak self] change in
            guard let self else { return }
            switch change {
            case let .chatList(chats):
                scheduleLaunchSnapshotWrite()
                projections.retireChatList(chats)
            case .receiptBackedDMs:
                projections.chatDestinations = nil
            }
        }
        captains.onChange = { [weak self] change in
            guard let self else { return }
            switch change {
            case let .agents(agents):
                scheduleLaunchSnapshotWrite()
                projections.retireAgents(agents)
            case .presence:
                projections.retirePresence()
            }
        }
    }
}
