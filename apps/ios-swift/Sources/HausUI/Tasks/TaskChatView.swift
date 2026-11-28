import SwiftUI

public struct TaskChatView: View {
    let header: TaskChatHeaderPresentation?
    let startedFrom: TaskStartedFromPresentation?
    let onOpenOrigin: () -> Void
    private let messageProvider: () -> [MessagePresentation]
    private let isLoaded: Bool
    private let isConnected: Bool
    private let isReadOnly: Bool
    let onSend: (String, [ComposerAttachment]) async -> Bool
    let onOpenAttachment: (MessageAttachmentPresentation) async throws -> URL
    let history: MessageHistoryNavigation
    private let engagementChatID: String?
    private let mentionOptions: [MentionOptionPresentation]
    private let onLoadMentionOptions: () async -> Void
    private let onVisibleMessagesChange: ([String]) -> Void
    /// The Task's fields and the writes that change them; nil while the Task
    /// is not loaded, which leaves the header read-only.
    let editing: TaskChatEditing?
    let unreadMessageID: String?
    /// The Task's Work pill over the composer; nil or hidden while it has no work.
    private let workPill: WorkPillState?
    private let onOpenWork: () -> Void

    /// Owned above this screen, keyed by Server and Task, so leaving the Task
    /// keeps the draft and its staged files.
    @Binding private var draft: String
    private let composerInteraction: ComposerInteraction
    @State var projection = TaskTranscriptProjection()
    @State var showsOutage = false
    @State private var holdExpired = false
    @State var isNearNewest = true
    @State var reveal: TranscriptReveal?
    @State var highlightedMessageID: String?
    @State var attachmentPreview: AttachmentPreview?
    @State var attachmentTiles = AttachmentImageTileRegistry()
    @State var visualHeights = VisualHeightRegistry()
    @Environment(\.reactionStickers) var reactionBoard
    @Environment(\.shellChrome) var shellChrome
    @State var actionMessage: MessagePresentation?
    @State var heldMessageID: String?
    @State var unreadJump = TranscriptUnreadJump(messageID: nil)
    @State var isRenamePresented = false
    @State var renameDraft = ""
    @State var editFailure: String?
    @AppStorage(ScrollNewMessagesToTop.storageKey)
    var scrollsNewMessagesToTop = ScrollNewMessagesToTop.defaultValue
    @FocusState private var isComposerFocused: Bool
    @Namespace private var composerTransitionNamespace

    public init(
        header: TaskChatHeaderPresentation?,
        startedFrom: TaskStartedFromPresentation?,
        onOpenOrigin: @escaping () -> Void,
        messages: @escaping () -> [MessagePresentation],
        isLoaded: Bool,
        isConnected: Bool = true,
        isReadOnly: Bool = false,
        draft: Binding<String>,
        composerInteraction: ComposerInteraction,
        onSend: @escaping (String, [ComposerAttachment]) async -> Bool,
        onOpenAttachment: @escaping (MessageAttachmentPresentation) async throws -> URL = { attachment in
            guard let localURL = attachment.localURL else { throw CancellationError() }
            return localURL
        },
        history: MessageHistoryNavigation = .init(),
        engagementChatID: String? = nil,
        landingMessageID: String? = nil,
        unreadMessageID: String? = nil,
        editing: TaskChatEditing? = nil,
        workPill: WorkPillState? = nil,
        onOpenWork: @escaping () -> Void = {},
        mentionOptions: [MentionOptionPresentation] = [],
        onLoadMentionOptions: @escaping () async -> Void = {},
        onVisibleMessagesChange: @escaping ([String]) -> Void = { _ in }
    ) {
        self.header = header
        self.startedFrom = startedFrom
        self.onOpenOrigin = onOpenOrigin
        self.messageProvider = messages
        self.isLoaded = isLoaded
        self.isConnected = isConnected
        self.isReadOnly = isReadOnly
        _draft = draft
        self.composerInteraction = composerInteraction
        self.onSend = onSend
        self.onOpenAttachment = onOpenAttachment
        self.history = history
        self.engagementChatID = engagementChatID
        self.unreadMessageID = unreadMessageID
        self.editing = editing
        self.workPill = workPill
        self.onOpenWork = onOpenWork
        self.mentionOptions = mentionOptions
        self.onLoadMentionOptions = onLoadMentionOptions
        self.onVisibleMessagesChange = onVisibleMessagesChange
        _reveal = State(initialValue: landingMessageID.map {
            TranscriptReveal(token: UUID(), id: $0, animated: false, placement: .landing)
        })
    }

    static let firstPageHold = Duration.milliseconds(1_200)
    /// How far the header scrim reaches below the navigation bar: short of the
    /// transcript's own top clearance, so a resting first row stays crisp.
    static let scrimOverhang: CGFloat = 10

    public var body: some View {
        chrome(screen)
            .connectionOutage(isConnected: isConnected, showsOutage: $showsOutage)
            .task { await onLoadMentionOptions() }
            .task(id: highlightedMessageID) { await fadeHighlight() }
            .task {
                guard !isLoaded else { return }
                try? await Task.sleep(for: Self.firstPageHold)
                holdExpired = true
            }
            .messageActionDrawer(for: $actionMessage, board: reactionBoard)
    }

    private var screen: some View {
        let messages = messageProvider()
        projection.update(startedFrom: startedFrom, messages: messages, hasOlder: history.hasOlder)
        let items = projection.items
        let rowRevision = rowRevision

        return GeometryReader { geometry in
            ZStack(alignment: .bottomLeading) {
                transcript(items: items, rowRevision: rowRevision)
                    .opacity(isLoaded || holdExpired ? 1 : 0)
                    .overlay(alignment: .top) {
                        if let engagementChatID {
                            HeaderEngagement(chatID: engagementChatID, style: .roster)
                        }
                    }
                    .safeAreaInset(edge: .bottom, spacing: 0) {
                        VStack(spacing: 0) {
                            WorkPillSlot(state: workPill, open: onOpenWork)
                            if isReadOnly {
                                ReadOnlyConversationNotice()
                            } else {
                                MessageComposerView(
                                    text: $draft,
                                    interaction: composerInteraction,
                                    place: .task,
                                    isTextFocused: $isComposerFocused,
                                    mentionOptions: mentionOptions,
                                    transitionNamespace: composerTransitionNamespace,
                                    onSend: onSend
                                )
                            }
                        }
                    }
            }
            .composerAttachmentPortal(
                interaction: composerInteraction,
                transitionNamespace: composerTransitionNamespace
            )
            .composerPortalFreeze(
                interaction: composerInteraction,
                isTextFocused: $isComposerFocused,
                liveBottomInset: geometry.safeAreaInsets.bottom
            )
        }
        .background(HausPlatformColor.canvas)
        .attachmentPreview(
            $attachmentPreview,
            images: projection.imagePages,
            tiles: attachmentTiles,
            onOpen: onOpenAttachment
        )
        .onChange(of: projection.messageIDs) { _, ids in
            visualHeights.retain(messageIDs: Set(ids))
            if let landing = reveal, landing.placement == .landing, !ids.isEmpty, !ids.contains(landing.id) {
                reveal = nil
            }
        }
        .onChange(of: unreadMessageID, initial: true) { _, id in
            unreadJump = TranscriptUnreadJump(messageID: id)
        }
    }

    private func transcript(items: [TaskTranscriptItem], rowRevision: Int) -> some View {
        GeometryReader { proxy in
            TranscriptListView(
                items: items,
                topInset: proxy.safeAreaInsets.top,
                bottomInset: proxy.safeAreaInsets.bottom,
                showsAccessory: history.hasOlder,
                onAppend: { previousItems, items, isNearNewest in
                    appendBehavior(previousItems: previousItems, items: items, isNearNewest: isNearNewest)
                },
                reveal: reveal,
                isNearNewest: $isNearNewest,
                onContentTap: { isComposerFocused = false },
                onVisibleItems: observeVisibleMessages,
                onLongPress: { item in actionMessage = Self.drawerMessage(for: item) },
                onHoldChange: { item in heldMessageID = item.flatMap(Self.drawerMessage(for:))?.id },
                rowRevision: rowRevision,
                row: { item in taskRow(item) },
                accessory: {
                    if history.hasOlder {
                        TranscriptLoadOlderButton(
                            title: "Load older messages",
                            isLoading: history.isLoading,
                            onLoad: history.loadOlder
                        )
                    }
                }
            )
            .ignoresSafeArea(edges: shellChrome.transcriptIgnoredEdges)
            .transcriptTopDissolve(safeAreaTop: proxy.safeAreaInsets.top)
            .overlay(alignment: .top) {
                ChromeTopScrim(fade: ChromeTopScrim.rowFade + Self.scrimOverhang)
                    .frame(height: proxy.safeAreaInsets.top + Self.scrimOverhang)
                    .frame(maxHeight: .infinity, alignment: .top)
                    .ignoresSafeArea()
            }
        }
        .overlay(alignment: .bottomTrailing) { jumpStack }
        .animation(.easeOut(duration: 0.18), value: jumps)
    }

    private func observeVisibleMessages(_ ids: [String]) {
        if unreadJump.messageID != nil {
            let next = unreadJump.observing(visibleIDs: ids, loadedIDs: projection.messageIDs)
            if next != unreadJump { unreadJump = next }
        }
        onVisibleMessagesChange(ids)
    }
}
