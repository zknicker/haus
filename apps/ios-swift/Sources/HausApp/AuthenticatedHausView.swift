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
                    .task {
                        guard !openingEntranceFinished else { return }
                        try? await Task.sleep(for: .seconds(1.2))
                        openingEntranceFinished = true
                    }
            }
        }
        .task { await store.start() }
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
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .background:
                hasBackgrounded = true
            case .active:
                guard hasBackgrounded else { return }
                hasBackgrounded = false
                Task { await store.resumeAfterForeground() }
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
                                appearance: appearanceBinding,
                                initialPath: initialPath
                            )
                        } else {
                            SettingsUnavailableSheet()
                        }
                    },
                    inboxCanvas: inboxCanvas(contentInsets:onOpenSidebar:),
                    onOpenTasks: { path.append(.tasks(focus: nil)) },
                    onOpenInbox: openInbox,
                    needsYouCount: store.needsYouCount,
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
                    onOpenAttachment: { attachment in
                        try await store.downloadAttachment(attachment)
                    },
                    hasOlderMessages: { store.hasOlderMessages(chatID: $0.id) },
                    isLoadingOlderMessages: { store.isLoadingOlderMessages(chatID: $0.id) },
                    onLoadOlderMessages: { await store.loadOlderMessages(chatID: $0.id) },
                    searchMessages: { query in
                        try await store.searchMessagePresentations(query: query)
                    },
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
                    }
                )
                .hausHiddenNavigationBar()
                .navigationDestination(for: HausRootRoute.self) { route in
                    switch route {
                    case .tasks(let focus):
                        TaskListDestinationView(
                            persistence: store.settingsTasksPersistence,
                            focus: focus,
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

    /// A Thread is a pushed screen above the canvas, so opening an Agent from a
    /// reply pops back to the canvas the shell's own Agent route lands on.
    @MainActor
    private func openAgentFromThread(_ agentID: String) {
        guard let destination = store.chatDestinations.agentDestination(agentID: agentID) else {
            return
        }
        openCanvasChat(destination.id)
    }

    /// The Chat the canvas has to have open. A pushed Thread or the Tasks list
    /// covers the canvas and owns the open Chat while it is on screen.
    private var canvasOpenChatID: String? {
        ChatCanvasOpen.chatID(
            selectedID: selectedDestinationID,
            isCovered: showsInboxCanvas || !path.isEmpty || selectedThread != nil
        )
    }

    /// The Chat the canvas is showing, covered or not. It is what a pop lands
    /// on, so the Store keeps its page fresh even while it is off screen.
    private var selectedCanvasChatID: String? {
        ChatCanvasOpen.canvasChatID(selectedID: selectedDestinationID)
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

    /// The pushed Thread screen. It owns the open Chat while it is on screen,
    /// which is why the selection sync above stands down for it.
    @ViewBuilder
    private func threadDestination(_ thread: ThreadSelection) -> some View {
        ThreadDetailView(
            anchor: store.messagePresentations(chatID: thread.parentChatID)
                .first(where: { $0.id == thread.anchor.id }) ?? thread.anchor,
            replies: {
                let chatID = resolvedThreadChatID(for: thread)
                    ?? store.pendingThreadChatID(anchorMessageID: thread.anchor.id)
                return store.messagePresentations(chatID: chatID)
            },
            isConnected: store.isConnected,
            openAsks: { store.openAsks },
            onSend: { content, attachments in
                guard let resolvedThreadChatID = await store.sendThreadReply(
                    content,
                    to: thread.parentChatID,
                    anchorMessageID: thread.anchor.id,
                    pendingChatID: thread.threadChatID
                        ?? store.pendingThreadChatID(anchorMessageID: thread.anchor.id),
                    attachments: attachments
                ) else { return false }

                // Server is authoritative for the child Chat id. Usually this
                // equals the route value; retaining the update makes a
                // stale/prospective route converge without deriving an id
                // on-device.
                if resolvedThreadChatID != thread.threadChatID {
                    selectedThread?.threadChatID = resolvedThreadChatID
                }
                // A prospective route had no child Chat to open on arrival.
                // Promote it to the canonical child now so subsequent sends and
                // read acknowledgements use the same Server Chat as the
                // transcript.
                if selectedThread?.id == thread.id {
                    await store.openChat(chatID: resolvedThreadChatID)
                }
                return true
            },
            onOpenAttachment: { attachment in
                try await store.downloadAttachment(attachment)
            },
            hasOlderReplies: resolvedThreadChatID(for: thread).map(store.hasOlderMessages) ?? false,
            isLoadingOlderReplies: resolvedThreadChatID(for: thread).map(store.isLoadingOlderMessages) ?? false,
            onLoadOlderReplies: {
                guard let chatID = resolvedThreadChatID(for: thread) else { return false }
                return await store.loadOlderMessages(chatID: chatID)
            },
            onOpenAgent: openAgentFromThread,
            onCancelCloudAgent: store.canManageServer ? { workID in
                try await store.cancelCloudAgent(workID: workID)
            } : nil
        )
        .task {
            guard let chatID = resolvedThreadChatID(for: thread) else { return }
            await store.openChat(chatID: chatID)
        }
    }

    private func resolvedThreadChatID(for thread: ThreadSelection) -> String? {
        thread.resolvedChatID(selectedThread: selectedThread, store: store)
    }
}
