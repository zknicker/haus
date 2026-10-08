import ClerkKit
import HausModels
import HausUI
import SwiftUI

struct AuthenticatedHausView: View {
    @State var store: HausStore
    /// The mutable mirror of the pushed Thread route. The route value itself
    /// stays stable so adopting a Server child Chat id cannot remount the
    /// screen mid-conversation.
    @State var selectedThread: ThreadSelection?
    /// The App owns the open Chat so the shell canvas, the pushed Thread, and
    /// the Store's read acknowledgements always name the same Chat.
    @State var selectedDestinationID: ChatDestination.ID?
    @State var path: [HausRootRoute] = []
    @State var agentCall: AgentCallRequest?
    /// A cold start lands on the Inbox, which is the canvas itself rather than
    /// a screen over it; see `AuthenticatedHausView+Routes`.
    @State var showsInboxCanvas = true
    /// iOS reaches `.active` through `.inactive` from both a real suspension and
    /// a Control Center pull or app-switcher peek. Only the first is a stale
    /// cache, so the refresh waits for a phase run that actually backgrounded.
    @State private var hasBackgrounded = false
    /// The opening entrance plays once, on the screen the initial load mounts;
    /// after it settles, chat switches and reloads mount plainly.
    @State private var openingEntranceFinished = false
    let push = PushNotifications.shared
    @AppStorage("appearancePreference") private var appearanceRawValue = AppearancePreference.system.rawValue
    @Environment(\.scenePhase) private var scenePhase

    init(clerk: Clerk) {
        let store = HausStore(clerk: clerk)
        let restored = UserDefaults.standard
            .string(forKey: ChatDestination.ID.lastOpenDefaultsKey)
            .flatMap(ChatDestination.ID.init(storageValue:))
        if case .chat(let chatID) = restored {
            store.preferredInitialChatID = chatID
        }
        _store = State(initialValue: store)
        _selectedDestinationID = State(initialValue: restored)
    }

    var body: some View {
        Group {
            switch store.state {
            case .idle, .loading:
                HausOpeningView()
            case .failed(let message):
                ContentUnavailableView {
                    Label("Haus is unavailable", systemImage: "wifi.exclamationmark")
                } description: {
                    VStack(spacing: 4) {
                        Text("Haus couldn't reach your Server. Check your connection and try again.")
                        Text(message)
                            .font(.footnote)
                            .foregroundStyle(.tertiary)
                    }
                } actions: {
                    Button("Try again") { Task { await store.retry() } }
                        .buttonStyle(.borderedProminent)
                }
            case .loaded:
                loadedContent
                    .environment(\.opensWithEntrance, !openingEntranceFinished)
                    .environment(\.reactionStickers, store.reactionStickers)
                    .environment(\.cloudAgentCancel, cloudAgentCancel)
                    .environment(\.chatEngagementSource, store.chatEngagementSource)
                    .environment(\.stoppedAgentSource, store.stoppedAgentSource)
                    .task {
                        guard !openingEntranceFinished else { return }
                        try? await Task.sleep(for: .seconds(1.2))
                        openingEntranceFinished = true
                    }
            }
        }
        .task { await store.start() }
        .onAppear(perform: installTranscriptRoutes)
        .sheet(item: $agentCall) { request in AgentCallView(request: request, client: store.client) }
        .onChange(of: selectedDestinationID) { previous, current in
            // The first selection lands from the shell's own sync; a change
            // from one destination to another is the user navigating, and a
            // screen mounted by navigation must not replay the entrance.
            if previous != nil { openingEntranceFinished = true }
            guard let current else { return }
            UserDefaults.standard.set(
                current.storageValue,
                forKey: ChatDestination.ID.lastOpenDefaultsKey
            )
        }
        .onChange(of: scenePhase, initial: true) { _, phase in
            applyReadForeground(phase)
            switch phase {
            case .background:
                hasBackgrounded = true
            case .active:
                Task { await push.clearDelivered(openedChatID: push.viewingChatID) }
                guard hasBackgrounded else {
                    // Pushes that arrived while inactive may have moved the
                    // badge; a return from the background refreshes it with
                    // the rest of the snapshot.
                    Task { await store.refreshIconBadge() }
                    return
                }
                hasBackgrounded = false
                Task {
                    await store.resumeAfterForeground()
                    // The reader may have changed permission in the Settings app.
                    await push.refreshAuthorization()
                }
            default:
                break
            }
        }
    }

    @ViewBuilder
    private var loadedContent: some View {
        Group {
            if let server = store.serverPresentation, !store.chatDestinations.isEmpty {
                NavigationStack(path: $path) {
                HausShellView(
                    server: server,
                    destinations: store.chatDestinations,
                    selectedDestinationID: $selectedDestinationID,
                    showsInbox: $showsInboxCanvas,
                    messagesForDestination: { store.messagePresentations(chatID: $0.pendingKey) },
                    isMessageHistoryLoaded: { destination in
                        guard let chat = destination.durableChat else { return true }
                        return store.hasLoadedMessageHistory(chatID: chat.id)
                    },
                    isConnected: store.isConnected,
                    settingsContent: { initialPath in
                        if let settingsData = store.settingsData {
                            SettingsSheet(
                                data: settingsData,
                                persistence: store.settingsPersistence,
                                cloudAgentActions: store.cloudAgentSettings,
                                notifications: push.setting,
                                appearance: appearanceBinding,
                                initialPath: initialPath,
                                onSignOut: { try await store.signOut() }
                            )
                        } else {
                            SettingsUnavailableSheet()
                        }
                    },
                    inboxCanvas: inboxCanvas(contentInsets:onOpenSidebar:),
                    onOpenTasks: { path.append(.tasks) },
                    onOpenInbox: openInbox,
                    showsTasks: path.last == .tasks,
                    inboxHasUnread: (store.unreadChatCount ?? 0) > 0,
                    ghostTempo: store.agentActivityGhostTempo,
                    onOpenThread: openThread,
                    onSend: { destination, content, attachments in
                        switch destination {
                        case .durableChat(let chat):
                            return await store.send(content, to: chat.id, attachments: attachments)
                        case .implicitAgentDM(let agent):
                            guard attachments.isEmpty,
                                  let chatID = await store.sendAgentDM(content, to: agent.id) else {
                                return false
                            }
                            selectedDestinationID = .chat(chatID)
                            return true
                        }
                    },
                    onSendInlineReply: { destination, content, attachments, reference in
                        guard case .durableChat(let chat) = destination else { return false }
                        return await store.send(
                            content,
                            to: chat.id,
                            attachments: attachments,
                            replyToMessageID: reference.id,
                            replyPreview: reference
                        )
                    },
                    onOpenAttachment: { attachment in
                        try await store.downloadAttachment(attachment)
                    },
                    onCallAgent: openAgentCall,
                    onMarkRead: { chat in
                        Task { await store.markChatRead(chatID: chat.id) }
                    },
                    messageHistory: { store.messageHistory(chatID: $0.id) },
                    searchMessages: { query, chatID in
                        try await store.searchMessagePresentations(query: query, chatID: chatID)
                    },
                    searchRecoveryRevision: store.agentMessageSearchRevision,
                    loadArchivedChannels: {
                        guard let serverID = await store.activeServer?.id else {
                            throw HausStoreError.serverUnavailable
                        }
                        return try await store.archivedChannelPresentations(serverID: serverID)
                    },
                    restoreArchivedChannel: { channel in
                        guard let serverID = await store.activeServer?.id else {
                            throw HausStoreError.serverUnavailable
                        }
                        _ = try await store.unarchiveChannel(
                            chatID: channel.id,
                            serverID: serverID
                        )
                    },
                    newChannelAgents: { store.newChannelAgentPresentations },
                    currentAgentActivity: { store.currentActivityPresentation(agentID: $0) },
                    loadAgentActivity: { agentID in
                        try await store.agentActivityPresentations(agentID: agentID)
                    },
                    agentProfile: { store.agentProfilePresentation(agentID: $0) },
                    mentionOptions: { store.mentionOptions(for: $0) },
                    loadMentionOptions: { await store.loadMentionOptions(for: $0) },
                    createChannel: { draft in
                        try await store.createNativeChannel(draft)
                    },
                    onVisibleMessages: reportVisibleMessages,
                    // Runs inside the drawer's animation, so a re-sort animates.
                    onDrawerPresentedChange: { open in
                        open ? store.holdSidebarOrder() : store.releaseSidebarOrder()
                    },
                    notice: { store.sendError }
                )
                .hausHiddenNavigationBar()
                .navigationDestination(for: HausRootRoute.self) { route in
                    switch route {
                    case .tasks:
                        TaskListDestinationView(
                            persistence: store.settingsTasksPersistence,
                            onOpenTask: openTask
                        )
                    case .thread(let thread):
                        threadDestination(thread)
                    }
                }
                .onChange(of: path) { _, current in
                    guard !current.carriesThread else { return }
                    selectedThread = nil
                }
                // One load at a time: selecting another Chat cancels the load
                // the previous selection started, so a slow `chat.list` behind a
                // stale read acknowledgement cannot land after a newer one.
                .task(id: canvasOpenChatID) {
                    guard let canvasOpenChatID else { return }
                    await store.openChat(chatID: canvasOpenChatID)
                }
                // The canvas Chat is recorded even while a pushed route covers
                // it, because that is the surface a pop returns to and the
                // Store has to keep its page fresh across a foreground. The
                // open-Chat load above deliberately stands down when covered,
                // so it cannot carry this.
                .onChange(of: selectedCanvasChatID, initial: true) { _, current in
                    store.canvasChatID = current
                }
                .onChange(of: viewingChatID, initial: true) { _, current in
                    push.viewingChatID = current
                    // Reads follow what is on screen. With the Inbox or the
                    // Task list showing, no Chat is open, so a covered canvas
                    // transcript cannot acknowledge what nobody is reading.
                    if current == nil { store.openChatID = nil }
                    Task { await push.clearDelivered(openedChatID: current) }
                }
                .onChange(of: store.iconBadgeCount, initial: true) { _, count in
                    push.updateBadge(unreadChatCount: count)
                }
                .task { await push.attach(store) }
                // Consumed outside the change handler: clearing the value a
                // `task(id:)` keys on would cancel the Thread anchor read.
                .onChange(of: push.pendingOpen, initial: true) { _, payload in
                    guard let payload else { return }
                    push.pendingOpen = nil
                    Task { await openPushNotification(payload) }
                }
                .preferredColorScheme(preferredColorScheme)
                }
            } else {
                ContentUnavailableView(
                    "No chats yet",
                    systemImage: "bubble.left.and.bubble.right",
                    description: Text("Create a channel from the sidebar, or message an Agent once one joins this Server.")
                )
            }
        }
    }

    /// Owners and Admins may cancel a live Cloud Agent run from its card.
    private var cloudAgentCancel: CloudAgentCancelAction? {
        guard store.canManageServer else { return nil }
        return CloudAgentCancelAction { [store] workID in try await store.cancelCloudAgent(workID: workID) }
    }

    private var appearanceBinding: Binding<AppearancePreference> {
        Binding(
            get: { AppearancePreference(rawValue: appearanceRawValue) ?? .system },
            set: { appearanceRawValue = $0.rawValue }
        )
    }

    private var preferredColorScheme: ColorScheme? {
        (AppearancePreference(rawValue: appearanceRawValue) ?? .system).colorScheme
    }
}
