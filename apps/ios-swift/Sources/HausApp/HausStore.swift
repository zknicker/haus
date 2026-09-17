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
    private(set) var state: State = .idle
    private(set) var isConnected = false
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
    // The Server-wide reads the Inbox and its sidebar badge stand on, loaded
    // and refreshed by `HausStoreInbox.swift`. Each stays nil until its first
    // load, which is what lets `needsYouCount` stay silent until it can answer
    // honestly, and what lets a durable event refresh only what this client
    // actually holds.
    var openAsks: [OpenAsk]?
    var inboxTasks: [TaskListItem]?
    var activeCloudAgentWork: [ActiveCloudAgentWork]?
    var serverUsage: ServerUsageSnapshot?
    /// How many background-tier tasks the Server-wide Task lens last hid. Zero
    /// whenever the last Server-wide read already widened the lens, which is
    /// what `task.list` reports for it.
    var taskBackgroundCount = 0
    var cloudAgentWorkByChatID: [String: [ThreadCloudAgentWork]] = [:] {
        didSet {
            if oldValue != cloudAgentWorkByChatID { projections.retireMessageProjections() }
        }
    }
    private var storedPendingMessagesByChatID: [String: [PendingChatMessage]] = [:]
    private var storedLifecycleAvailability: [String: AgentAvailability] = [:]
    var sendError: String?
    var chatEventServerID: String?
    var chatEventReplay = ChatEventReplayState()
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
    var olderMessageLoadsInFlight: Set<String> = []
    /// Live SSE events accumulate here for one short window before the existing
    /// batch applier runs; the catch-up walk already arrives batched.
    @ObservationIgnored var liveChatEvents = ChatEventCoalescer()
    @ObservationIgnored var liveChatEventFlush: Task<Void, Never>?
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

    func start() async {
        guard case .idle = state else { return }
        state = .loading
        do {
            if HausRuntimeConfiguration.development != nil {
                let _: ServerSummary = try await client.mutation("server.developmentBootstrap")
            }
            let loadedServers: [ServerSummary] = try await client.query("server.list")
            if activeServer?.id != loadedServers.first?.id {
                resetInlineReplyCache()
            }
            servers = loadedServers
            guard let server = loadedServers.first else {
                state = .failed("You do not have a Haus Server yet.")
                return
            }
            try await syncHumanIdentity(serverID: server.id)
            try await reloadServer(server.id)
            startEventStreams(serverID: server.id)
            isConnected = true
            state = .loaded
        } catch {
            state = .failed(error.localizedDescription)
            isConnected = false
        }
    }

    func retry() async {
        stopEventStreams()
        state = .idle
        await start()
    }

    private func reloadServer(_ serverID: String) async throws {
        async let loadedChats: [ChatSummary] = client.query(
            "chat.list",
            input: ServerScopedInput(serverId: serverID)
        )
        async let loadedAgents: [AgentSummary] = client.query(
            "agent.list",
            input: ServerScopedInput(serverId: serverID)
        )
        async let loadedMembers: MemberList = client.query(
            "member.list",
            input: ServerScopedInput(serverId: serverID)
        )
        chats = try await loadedChats
        agents = try await loadedAgents
        if !lifecycleAvailability.isEmpty { lifecycleAvailability.removeAll() }
        members = try await loadedMembers
        await reloadActiveActivity(serverID: serverID)
        await loadComputers(serverID: serverID)

        let initialChatID = preferredInitialChatID
            .flatMap { preferred in chats.first { $0.id == preferred }?.id }
            ?? chats.first?.id
        if let initialChatID {
            await loadMessages(chatID: initialChatID)
        }
    }

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
            projections.retireDirectoryProjections()
        }
    }

    /// Names and avatars for human authors, mentions, and human DMs.
    var members: MemberList? {
        get { storedMembers }
        set {
            guard storedMembers != newValue else { return }
            storedMembers = newValue
            projections.retireDirectoryProjections()
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
            projections.retireDirectoryProjections()
        }
    }

    var chats: [ChatSummary] {
        get { storedChats }
        set {
            guard storedChats != newValue else { return }
            storedChats = newValue
            projections.retireChatListProjection()
        }
    }

    /// Agent DMs Server has materialized but the Chat list has not caught up to.
    var receiptBackedAgentDMsByChatID: [String: String] {
        get { storedReceiptBackedAgentDMsByChatID }
        set {
            guard storedReceiptBackedAgentDMsByChatID != newValue else { return }
            storedReceiptBackedAgentDMsByChatID = newValue
            projections.retireChatListProjection()
        }
    }

    var messagesByChatID: [String: ChatMessagePage] {
        get { storedMessagesByChatID }
        set {
            guard storedMessagesByChatID != newValue else { return }
            storedMessagesByChatID = newValue
            projections.retireMessageProjections()
        }
    }

    var pendingMessagesByChatID: [String: [PendingChatMessage]] {
        get { storedPendingMessagesByChatID }
        set {
            guard storedPendingMessagesByChatID != newValue else { return }
            storedPendingMessagesByChatID = newValue
            projections.retireMessageProjections()
        }
    }
}
