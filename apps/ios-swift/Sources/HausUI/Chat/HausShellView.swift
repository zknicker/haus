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
    /// Whether Tasks is the screen on top, so the sidebar marks it rather than
    /// the Chat behind it.
    private let showsTasks: Bool
    private let inboxHasUnread: Bool
    private let ghostTempo: HausGhostTempo
    let onOpenThread: (ChatPresentation, MessagePresentation) -> Void
    let onSend: (ChatDestination, String, [ComposerAttachment]) async -> Bool
    let onSendInlineReply:
        ((ChatDestination, String, [ComposerAttachment], MessageReplyReferencePresentation) async -> Bool)?
    let onOpenAttachment: (MessageAttachmentPresentation) async throws -> URL
    let onCallAgent: ((ChatDestination) -> Void)?
    /// Mark read from a sidebar row's long-press menu. Absent, the menu has no
    /// Mark Read.
    private let onMarkRead: ((ChatPresentation) -> Void)?
    let messageHistory: (ChatPresentation) -> MessageHistoryNavigation
    private let searchMessages: MessageSearch
    private let searchRecoveryRevision: Int
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
    /// The message ids the canvas transcript is showing. It passes straight
    /// through to the App, which owns read acknowledgement.
    let onVisibleMessages: (ChatDestination, [String]) -> Void
    /// Every settled drawer open or close. The App freezes the sidebar's order
    /// while it is open, so a re-sort lands on the next open, animated.
    let onDrawerPresentedChange: (Bool) -> Void
    /// The latest failure worth telling the reader about, read by the notice
    /// banner alone so a new error never re-runs the shell body.
    private let notice: () -> String?

    @Binding var selectedDestinationID: ChatDestination.ID?
    /// Whether the canvas is the Inbox rather than the selected Chat. The App
    /// owns it because the App is what lands on it and what routes away from
    /// it; the shell only clears it when a Chat is selected.
    @Binding var showsInbox: Bool
    @State var drawer = HausDrawerState()
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
    /// Ticks once per Chat switch that no drawer snap already announced.
    @State var chatSwitchFeedback = 0

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
        showsTasks: Bool = false,
        inboxHasUnread: Bool = false,
        ghostTempo: HausGhostTempo = .calm,
        onOpenThread: @escaping (ChatPresentation, MessagePresentation) -> Void = { _, _ in },
        onSend: @escaping (ChatDestination, String, [ComposerAttachment]) async -> Bool,
        onSendInlineReply: ((ChatDestination, String, [ComposerAttachment], MessageReplyReferencePresentation) async -> Bool)? = nil,
        onOpenAttachment: @escaping (MessageAttachmentPresentation) async throws -> URL = { attachment in
            guard let localURL = attachment.localURL else { throw CancellationError() }
            return localURL
        },
        onCallAgent: ((ChatDestination) -> Void)? = nil,
        onMarkRead: ((ChatPresentation) -> Void)? = nil,
        messageHistory: @escaping (ChatPresentation) -> MessageHistoryNavigation = { _ in .init() },
        searchMessages: @escaping MessageSearch = { _, _ in [] },
        searchRecoveryRevision: Int = 0,
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
        },
        onVisibleMessages: @escaping (ChatDestination, [String]) -> Void = { _, _ in },
        onDrawerPresentedChange: @escaping (Bool) -> Void = { _ in },
        notice: @escaping () -> String? = { nil }
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
        self.showsTasks = showsTasks
        self.inboxHasUnread = inboxHasUnread
        self.ghostTempo = ghostTempo
        self.onOpenThread = onOpenThread
        self.onSend = onSend
        self.onSendInlineReply = onSendInlineReply
        self.onOpenAttachment = onOpenAttachment
        self.onCallAgent = onCallAgent
        self.onMarkRead = onMarkRead
        self.messageHistory = messageHistory
        self.searchMessages = searchMessages
        self.searchRecoveryRevision = searchRecoveryRevision
        self.loadArchivedChannels = loadArchivedChannels
        self.restoreArchivedChannel = restoreArchivedChannel
        self.newChannelAgents = newChannelAgents
        self.currentAgentActivity = currentAgentActivity
        self.loadAgentActivity = loadAgentActivity
        self.agentProfile = agentProfile
        self.mentionOptions = mentionOptions
        self.loadMentionOptions = loadMentionOptions
        self.createChannel = createChannel
        self.onVisibleMessages = onVisibleMessages
        self.onDrawerPresentedChange = onDrawerPresentedChange
        self.notice = notice
    }

    public var body: some View {
        GeometryReader { proxy in
            let drawerWidth = min(proxy.size.width * 0.82, 340)
            ZStack(alignment: .leading) {
                HausDrawerSidebarFrame(drawer: drawer, drawerWidth: drawerWidth, height: proxy.size.height) {
                    ChatSidebarView(
                        server: server,
                        destinations: destinations,
                        selection: sidebarSelection,
                        onSelectDestination: selectDestination,
                        onOpenSettings: { openSettings() },
                        onOpenSearch: { activeChatSheet = .search(scope: nil) },
                        onOpenInbox: openInboxCanvas,
                        inboxHasUnread: inboxHasUnread,
                        ghostTempo: ghostTempo,
                        onOpenTasks: openTasks,
                        onOpenArchived: { activeChatSheet = .archived },
                        onOpenNewChannel: { activeChatSheet = .newChannel },
                        onMarkRead: onMarkRead,
                        onOpenDetails: { activeChatSheet = .details($0) }
                    )
                }
                .zIndex(1)

                canvas(proxy: proxy, drawerWidth: drawerWidth)
            }
            .background(HausPlatformColor.background)
            // Below the chrome row, over whatever is there: a notice never
            // moves the transcript or the drawer.
            .overlay(alignment: .top) {
                HausShellNoticeHost(message: notice)
                    .padding(.top, HausChrome.headerHeight + 4)
            }
        }
        .sensoryFeedback(.selection, trigger: chatSwitchFeedback)
        .sheet(item: $settingsRequest) { request in settingsContent(request.path) }
        .sheet(item: $activeChatSheet, onDismiss: presentQueuedSettings) { sheet in
            switch sheet {
            case .search(let scope):
                ServerSearchView(
                    chats: durableChats,
                    scopeChat: scope,
                    searchMessages: searchMessages,
                    searchRecoveryRevision: searchRecoveryRevision,
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

    /// The sidebar marks what is on screen: Tasks over everything, then the
    /// Inbox canvas, then the Chat it would otherwise be showing.
    private var sidebarSelection: SidebarSelection? {
        if showsTasks { return .tasks }
        if showsInbox { return .inbox }
        return selectedDestination.map { .chat($0.id) }
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
