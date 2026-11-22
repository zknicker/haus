import SwiftUI

public struct TaskChatView: View {
    let header: TaskChatHeaderPresentation?
    let contextLabel: String?
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

    /// Owned above this screen, keyed by Server and Task, so leaving the Task
    /// keeps the draft and its staged files.
    @Binding private var draft: String
    private let composerInteraction: ComposerInteraction
    @State var projection = TaskTranscriptProjection()
    @State private var showsOutage = false
    @State private var holdExpired = false
    @State private var isNearNewest = true
    @State var reveal: TranscriptReveal?
    @State var highlightedMessageID: String?
    @State var attachmentPreview: AttachmentPreview?
    @State var attachmentTiles = AttachmentImageTileRegistry()
    @State var visualHeights = VisualHeightRegistry()
    @Environment(\.reactionStickers) var reactionBoard
    @State var actionMessage: MessagePresentation?
    @State var heldMessageID: String?
    @FocusState private var isComposerFocused: Bool
    @Namespace private var composerTransitionNamespace

    public init(
        header: TaskChatHeaderPresentation?,
        contextLabel: String?,
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
        mentionOptions: [MentionOptionPresentation] = [],
        onLoadMentionOptions: @escaping () async -> Void = {},
        onVisibleMessagesChange: @escaping ([String]) -> Void = { _ in }
    ) {
        self.header = header
        self.contextLabel = contextLabel
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
        self.mentionOptions = mentionOptions
        self.onLoadMentionOptions = onLoadMentionOptions
        self.onVisibleMessagesChange = onVisibleMessagesChange
        _reveal = State(initialValue: landingMessageID.map {
            TranscriptReveal(token: UUID(), id: $0, animated: false, placement: .landing)
        })
    }

    static let firstPageHold = Duration.milliseconds(1_200)

    public var body: some View {
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
                    .safeAreaInset(edge: .top, spacing: 0) {
                        if let header {
                            TaskChatHeader(header: header, maxHeight: geometry.size.height * 0.4)
                        }
                    }
                    .safeAreaInset(edge: .bottom, spacing: 0) {
                        if isReadOnly {
                            ReadOnlyConversationNotice()
                        } else {
                            MessageComposerView(
                                text: $draft,
                                interaction: composerInteraction,
                                placeholder: header.map { "Message \($0.key)" } ?? "Message",
                                isTextFocused: $isComposerFocused,
                                mentionOptions: mentionOptions,
                                transitionNamespace: composerTransitionNamespace,
                                onSend: onSend
                            )
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
        .background(.background)
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
        .inlineNavigationTitle(
            header?.key ?? "",
            subtitle: showsOutage ? ConnectionOutage.title : contextLabel
        )
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

    private func transcript(items: [TaskTranscriptItem], rowRevision: Int) -> some View {
        GeometryReader { proxy in
            TranscriptListView(
                items: items,
                topInset: proxy.safeAreaInsets.top,
                bottomInset: proxy.safeAreaInsets.bottom,
                showsAccessory: history.hasOlder,
                onAppend: { previousItems, items, isNearNewest in
                    let previousLatest = previousItems.last(where: { $0.message != nil })?.id
                    if previousLatest == nil { return .snapToNewest }
                    if items.last?.isPending == true { return .animateToNewest }
                    return isNearNewest && history.followsLatest ? .followNewest : .stay
                },
                reveal: reveal,
                isNearNewest: $isNearNewest,
                onContentTap: { isComposerFocused = false },
                onVisibleItems: onVisibleMessagesChange,
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
            .ignoresSafeArea()
            .transcriptTopDissolve(safeAreaTop: proxy.safeAreaInsets.top)
            .overlay(alignment: .bottom) {
                if !isNearNewest || history.hasNewer {
                    TranscriptJumpButton(label: "Scroll to latest message") {
                        Task {
                            let id = history.hasNewer ? await history.loadLatest() : messageProvider().last?.id
                            if let id {
                                reveal = TranscriptReveal(token: UUID(), id: id, animated: !history.hasNewer)
                            }
                        }
                    }
                    .padding(.bottom, 10)
                    .safeAreaPadding(.bottom)
                }
            }
        }
    }
}
