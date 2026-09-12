import SwiftUI
import Foundation

public struct HausShellView<SettingsContent: View, InboxCanvas: View>: View {
    private let server: ServerPresentation
    let destinations: [ChatDestination]
    let messagesForDestination: (ChatDestination) -> [MessagePresentation]
    let isMessageHistoryLoaded: (ChatDestination) -> Bool
    let isConnected: Bool
    private let settingsContent: ([SettingsRoute]) -> SettingsContent
    /// The Inbox as the canvas draws it. The App owns the page and its reads;
    /// the shell owns where it sits, what slides over it, and the drawer toggle
    /// it is handed — the drawer is the canvas's, not the page's.
    @ViewBuilder let inboxCanvas: (EdgeInsets, @escaping () -> Void) -> InboxCanvas
    let onOpenTasks: () -> Void
    let onOpenInbox: () -> Void
    private let needsYouCount: Int
    private let ghostTempo: HausGhostTempo
    let onOpenThread: (ChatPresentation, MessagePresentation) -> Void
    let onSend: (ChatDestination, String, [ComposerAttachment]) async -> Bool
    let onOpenAttachment: (MessageAttachmentPresentation) async throws -> URL
    let hasOlderMessages: (ChatPresentation) -> Bool
    let isLoadingOlderMessages: (ChatPresentation) -> Bool
    let onLoadOlderMessages: (ChatPresentation) async -> Bool
    private let searchMessages: @Sendable (String) async throws -> [MessageSearchResultPresentation]
    private let loadArchivedChannels: @Sendable () async throws -> [ArchivedChannelPresentation]
    private let restoreArchivedChannel: @Sendable (ArchivedChannelPresentation) async throws -> Void
    /// Sheet-only inputs arrive as closures so the sheet body that draws them
    /// is what observes them. Passing the resolved values in would subscribe
    /// the whole shell to state only one sheet ever reads — and Agent activity
    /// changes several times a second.
    private let newChannelAgents: () -> [NewChannelAgentPresentation]
    private let createChannel: @Sendable (NewChannelDraft) async throws -> CreatedChannelPresentation
    private let currentAgentActivity: (String) -> AgentActivityPresentation?
    private let loadAgentActivity: @Sendable (String) async throws -> [AgentActivityPresentation]
    private let agentProfile: (String) -> AgentProfilePresentation?
    let mentionOptions: (ChatDestination) -> [MentionOptionPresentation]
    let loadMentionOptions: (ChatDestination) async -> Void

    @Binding var selectedDestinationID: ChatDestination.ID?
    /// Whether the canvas is the Inbox rather than the selected Chat. The App
    /// owns it because the App is what lands on it and what routes away from
    /// it; the shell only clears it when a Chat is selected.
    @Binding var showsInbox: Bool
    @State var drawerPresented = false
    @State var settingsRequest: SettingsPresentationRequest?
    /// Settings queued behind a Chat sheet that has to dismiss first; the two
    /// sheet surfaces are mutually exclusive.
    @State var queuedSettingsRequest: SettingsPresentationRequest?
    @State var activeChatSheet: HausShellSheet?
    @State var pendingChatSelectionID: String?
    /// Composer drafts live above the canvas: the canvas is keyed by
    /// destination, so a Chat switch remounts the screen and anything the
    /// screen owned would go with it.
    @State var drafts: [ChatDestination.ID: String] = [:]
    /// Staged attachments live above the canvas for the same reason drafts do —
    /// a Chat switch or a push-over must not throw away files the user picked.
    @State var composerInteractions = ComposerInteractionStore()
    @State var scrollTarget: MessageScrollTarget?
    @State var dragTranslation: CGFloat?
    /// What the current close is, for as long as one is running. Only the veil
    /// reads it, and only a Chat selection ever sets anything else.
    @State var drawerClose = HausDrawerClose.interactive
    @Environment(\.colorScheme) var colorScheme

    public init(
        server: ServerPresentation,
        destinations: [ChatDestination],
        selectedDestinationID: Binding<ChatDestination.ID?> = .constant(nil),
        showsInbox: Binding<Bool> = .constant(false),
        messagesForDestination: @escaping (ChatDestination) -> [MessagePresentation],
        isMessageHistoryLoaded: @escaping (ChatDestination) -> Bool = { _ in true },
        isConnected: Bool,
        @ViewBuilder settingsContent: @escaping ([SettingsRoute]) -> SettingsContent,
        @ViewBuilder inboxCanvas: @escaping (EdgeInsets, @escaping () -> Void) -> InboxCanvas,
        onOpenTasks: @escaping () -> Void = {},
        onOpenInbox: @escaping () -> Void = {},
        needsYouCount: Int = 0,
        ghostTempo: HausGhostTempo = .calm,
        onOpenThread: @escaping (ChatPresentation, MessagePresentation) -> Void = { _, _ in },
        onSend: @escaping (ChatDestination, String, [ComposerAttachment]) async -> Bool,
        onOpenAttachment: @escaping (MessageAttachmentPresentation) async throws -> URL = { attachment in
            guard let localURL = attachment.localURL else { throw CancellationError() }
            return localURL
        },
        hasOlderMessages: @escaping (ChatPresentation) -> Bool = { _ in false },
        isLoadingOlderMessages: @escaping (ChatPresentation) -> Bool = { _ in false },
        onLoadOlderMessages: @escaping (ChatPresentation) async -> Bool = { _ in false },
        searchMessages: @escaping @Sendable (String) async throws -> [MessageSearchResultPresentation] = { _ in [] },
        loadArchivedChannels: @escaping @Sendable () async throws -> [ArchivedChannelPresentation] = { [] },
        restoreArchivedChannel: @escaping @Sendable (ArchivedChannelPresentation) async throws -> Void = { _ in },
        newChannelAgents: @escaping () -> [NewChannelAgentPresentation] = { [] },
        currentAgentActivity: @escaping (String) -> AgentActivityPresentation? = { _ in nil },
        loadAgentActivity: @escaping @Sendable (String) async throws -> [AgentActivityPresentation] = { _ in [] },
        agentProfile: @escaping (String) -> AgentProfilePresentation? = { _ in nil },
        mentionOptions: @escaping (ChatDestination) -> [MentionOptionPresentation] = { _ in [] },
        loadMentionOptions: @escaping (ChatDestination) async -> Void = { _ in },
        createChannel: @escaping @Sendable (NewChannelDraft) async throws -> CreatedChannelPresentation = { _ in
            throw CancellationError()
        }
    ) {
        _selectedDestinationID = selectedDestinationID
        _showsInbox = showsInbox
        self.server = server
        self.destinations = destinations
        self.messagesForDestination = messagesForDestination
        self.isMessageHistoryLoaded = isMessageHistoryLoaded
        self.isConnected = isConnected
        self.settingsContent = settingsContent
        self.inboxCanvas = inboxCanvas
        self.onOpenTasks = onOpenTasks
        self.onOpenInbox = onOpenInbox
        self.needsYouCount = needsYouCount
        self.ghostTempo = ghostTempo
        self.onOpenThread = onOpenThread
        self.onSend = onSend
        self.onOpenAttachment = onOpenAttachment
        self.hasOlderMessages = hasOlderMessages
        self.isLoadingOlderMessages = isLoadingOlderMessages
        self.onLoadOlderMessages = onLoadOlderMessages
        self.searchMessages = searchMessages
        self.loadArchivedChannels = loadArchivedChannels
        self.restoreArchivedChannel = restoreArchivedChannel
        self.newChannelAgents = newChannelAgents
        self.currentAgentActivity = currentAgentActivity
        self.loadAgentActivity = loadAgentActivity
        self.agentProfile = agentProfile
        self.mentionOptions = mentionOptions
        self.loadMentionOptions = loadMentionOptions
        self.createChannel = createChannel
    }

    public var body: some View {
        GeometryReader { proxy in
            let drawerWidth = min(proxy.size.width * 0.82, 340)
            ZStack(alignment: .leading) {
                ChatSidebarView(
                    server: server,
                    destinations: destinations,
                    selectedDestinationID: selectedDestination?.id,
                    onSelectDestination: selectDestination,
                    onOpenSettings: { openSettings() },
                    onOpenSearch: { activeChatSheet = .search },
                    onOpenInbox: onOpenInbox,
                    needsYouCount: needsYouCount,
                    ghostTempo: ghostTempo,
                    onOpenTasks: openTasks,
                    onOpenArchived: { activeChatSheet = .archived },
                    onOpenNewChannel: { activeChatSheet = .newChannel }
                )
                // `.mask()` below rasterizes this view into an offscreen buffer
                // sized to its own resolved height, which `.ignoresSafeArea()`
                // bleed cannot expand — so the room the search and gear button
                // shadows spill into has to come from a genuinely taller
                // proposed frame. `ChatSidebarView` reserves that height as
                // inert space at both of its own ends; lifting the masked
                // result by one of them puts its content back where it was.
                .frame(
                    width: drawerWidth,
                    height: proxy.size.height + ChatSidebarView.shadowBleedHeight * 2,
                    alignment: .top
                )
                .offset(x: -(1 - drawerProgress(drawerWidth: drawerWidth)) * drawerWidth * 0.22)
                .mask(alignment: .leading) {
                    Rectangle().frame(width: canvasOffset(drawerWidth: drawerWidth))
                }
                .offset(y: -ChatSidebarView.shadowBleedHeight)
                .frame(height: proxy.size.height, alignment: .top)
                .allowsHitTesting(drawerPresented)
                .zIndex(1)

                canvas(proxy: proxy, drawerWidth: drawerWidth)
            }
            .background(HausPlatformColor.background)
        }
        .sheet(item: $settingsRequest) { request in settingsContent(request.path) }
        .sheet(item: $activeChatSheet, onDismiss: presentQueuedSettings) { sheet in
            switch sheet {
            case .search:
                ServerSearchView(
                    chats: durableChats,
                    searchMessages: searchMessages,
                    onSelectChat: { open($0) },
                    onSelectMessage: openSearchResult
                )
            case .archived:
                ArchivedChannelsView(
                    load: loadArchivedChannels,
                    restore: restoreArchivedChannel,
                    onRestored: selectRestoredChannel
                )
            case .newChannel:
                NewChannelFormView(
                    agents: newChannelAgents(),
                    create: createChannel,
                    onCreated: selectCreatedChannel
                )
            case .details(let chat):
                ChatDetailsView(
                    chat: chat,
                    server: server,
                    currentActivity: agentActivity(for: chat),
                    loadAgentActivity: loadAgentActivity,
                    agentProfile: agentProfile,
                    onOpenAgentProfile: openAgentProfile
                )
            }
        }
        .onChange(of: destinations.map(\.id), initial: true) { _, destinationIDs in
            syncSelection(destinationIDs: destinationIDs)
        }
    }

    /// Called from the details sheet's own body, so the activity stream
    /// invalidates that sheet rather than the shell behind it.
    private func agentActivity(for chat: ChatDestination) -> AgentActivityPresentation? {
        guard case .agentDirectMessage(let agent) = chat.kind else { return nil }
        return currentAgentActivity(agent.id)
    }

}

#Preview {
    @Previewable @State var selectedDestinationID: ChatDestination.ID? = ChatFixtures.chats.first.map { .chat($0.id) }

    HausShellView(
        server: ChatFixtures.server,
        destinations: ChatFixtures.chats.map(ChatDestination.durableChat),
        selectedDestinationID: $selectedDestinationID,
        messagesForDestination: { _ in ChatFixtures.messages },
        isConnected: true,
        settingsContent: { path in
            SettingsSheet(initialPath: path)
        },
        inboxCanvas: { _, _ in EmptyView() },
        onSend: { _, _, _ in true }
    )
}
