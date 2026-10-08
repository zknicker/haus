import SwiftUI

public struct ChatSidebarView: View {
    /// Real (non-safe-area-bleed) space reserved above and below the visible
    /// content so the floating chrome buttons' shadows have room to render.
    /// `HausShellView` composites this view with `.mask()`, which rasterizes
    /// into an offscreen buffer sized to this view's own resolved height —
    /// `.ignoresSafeArea()` bleed does not survive that, so the extra room has
    /// to come from actual layout height. `HausShellView` grows the proposed
    /// height by this amount at both ends and lifts the result back by one, so
    /// the content itself stays exactly where it was.
    static let shadowBleedHeight: CGFloat = 32

    /// One left edge for every line in the sidebar: the Server identity, the
    /// section labels, and each row's glyph all start here.
    private static let railInset: CGFloat = 20
    /// A row paints its selection capsule outside the rail, so the scrolling
    /// list is inset by the difference and every row re-adds it. Without that
    /// split a row's glyph would sit a capsule's inset right of the header.
    private static let rowCapsuleBleed: CGFloat = 12
    /// What the scrolling list is inset by so a row's own bleed lands its
    /// glyph back on the rail.
    private static var listInset: CGFloat { railInset - rowCapsuleBleed }
    /// The family's own 1.5 reads thin against a row's body text.
    private static let rowGlyphWeight: CGFloat = 1.8
    /// Past this the glyph column would crowd the title it introduces.
    private static let maxGlyphSize: CGFloat = 40

    private let server: ServerPresentation
    private let destinations: [ChatDestination]
    private let selection: SidebarSelection?
    private let onSelectDestination: (ChatDestination) -> Void
    private let onOpenSettings: () -> Void
    private let onOpenSearch: () -> Void
    private let onOpenInbox: () -> Void
    /// Whether any Chat is unread. The Inbox row spends it as the same unread
    /// dot the Chat rows wear, so it shows nothing when nothing is.
    private let inboxHasUnread: Bool
    /// How fast the Inbox mark's mesh drifts: `lively` only while an Agent on
    /// this Server is working.
    private let ghostTempo: HausGhostTempo
    private let onOpenTasks: () -> Void
    private let onOpenArchived: () -> Void
    private let onOpenNewChannel: () -> Void
    private let onMarkRead: ((ChatPresentation) -> Void)?
    private let onOpenDetails: (ChatDestination) -> Void

    /// Every row leads with a glyph in a box this size, so the labels behind
    /// them share one column too. It grows with text size, up to a cap.
    @ScaledMetric(relativeTo: .body) private var rowGlyphSize: CGFloat = 26
    @ScaledMetric(relativeTo: .body) private var rowHeight: CGFloat = 42
    @ScaledMetric(relativeTo: .body) private var sectionHeaderHeight: CGFloat = 34
    @ScaledMetric(relativeTo: .body) private var sectionGlyphSize: CGFloat = 17
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    public init(
        server: ServerPresentation,
        destinations: [ChatDestination],
        selection: SidebarSelection?,
        onSelectDestination: @escaping (ChatDestination) -> Void,
        onOpenSettings: @escaping () -> Void,
        onOpenSearch: @escaping () -> Void = {},
        onOpenInbox: @escaping () -> Void = {},
        inboxHasUnread: Bool = false,
        ghostTempo: HausGhostTempo = .calm,
        onOpenTasks: @escaping () -> Void = {},
        onOpenArchived: @escaping () -> Void = {},
        onOpenNewChannel: @escaping () -> Void = {},
        onMarkRead: ((ChatPresentation) -> Void)? = nil,
        onOpenDetails: @escaping (ChatDestination) -> Void = { _ in }
    ) {
        self.server = server
        self.destinations = destinations
        self.selection = selection
        self.onSelectDestination = onSelectDestination
        self.onOpenSettings = onOpenSettings
        self.onOpenSearch = onOpenSearch
        self.onOpenInbox = onOpenInbox
        self.inboxHasUnread = inboxHasUnread
        self.ghostTempo = ghostTempo
        self.onOpenTasks = onOpenTasks
        self.onOpenArchived = onOpenArchived
        self.onOpenNewChannel = onOpenNewChannel
        self.onMarkRead = onMarkRead
        self.onOpenDetails = onOpenDetails
    }

    public var body: some View {
        // The bracketing `shadowBleed` rows reserve real space (not a
        // safe-area bleed hint) for the search and gear buttons' shadows — see
        // `shadowBleedHeight`. They don't move anything: `HausShellView`
        // grows this view's proposed height by both, so the ZStack below still
        // resolves to its original height.
        VStack(spacing: 0) {
            shadowBleed

            ZStack(alignment: .bottomTrailing) {
                VStack(alignment: .leading, spacing: 14) {
                    ChromeHeader(inset: Self.railInset, leading: { serverTitle }) {
                        GlassChromeButton(.icon(.search), label: "Search", action: onOpenSearch)
                    }

                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 5) {
                            // Server-wide destinations lead, then the chat
                            // lists — the App's own sidebar order, Inbox first.
                            SidebarInboxRow(
                                hasUnread: inboxHasUnread,
                                ghostTempo: ghostTempo,
                                metrics: metrics,
                                isSelected: selection == .inbox,
                                onOpen: onOpenInbox
                            )

                            SidebarUtilityRow(
                                title: "Tasks",
                                icon: .tasks,
                                metrics: metrics,
                                isSelected: selection == .tasks,
                                action: onOpenTasks
                            )

                            sectionHeader("Channels", trailingAction: onOpenNewChannel)
                                .padding(.top, 6)
                            ForEach(channels) { row($0) }

                            sectionHeader("DMs")
                                .padding(.top, 6)
                            ForEach(directMessages) { row($0) }
                        }
                        // The inset rides on the list, not on the scroll
                        // view: the unread markers sit in the gutter outside
                        // each row, and the scroll view's clip must not reach
                        // them.
                        .padding(.horizontal, Self.listInset)
                        .padding(.bottom, 72)
                        // The App holds the order still while the drawer is
                        // open; a re-sort lands as the drawer next opens, and
                        // rows travel to their new places rather than jump.
                        .animation(.snappy(duration: 0.35), value: destinations.map(\.id))
                    }
                    .scrollIndicators(.hidden)
                }

                GlassChromeButton(.icon(.settings), label: "Settings", action: onOpenSettings)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 8)
            }

            shadowBleed
        }
        .background(HausPlatformColor.background)
    }

    private var metrics: SidebarRowMetrics {
        SidebarRowMetrics(
            glyph: min(rowGlyphSize, Self.maxGlyphSize),
            rowHeight: rowHeight,
            capsuleBleed: Self.rowCapsuleBleed,
            listInset: Self.listInset,
            isAccessibilitySize: dynamicTypeSize.isAccessibilitySize
        )
    }

    /// The Server identity doubles as the Server menu, the way the App's
    /// sidebar band does. Archiving is a Server-wide chore rather than a
    /// destination, so it lives here instead of spending a navigation row.
    private var serverTitle: some View {
        Menu {
            Button {
                onOpenArchived()
            } label: {
                Label("Archived chats", systemImage: "archivebox")
            }
        } label: {
            HStack(spacing: 5) {
                Text(server.name).font(.title3.weight(.semibold)).lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            // The hit area hugs the identity rather than filling the row, so
            // the header's trailing chrome keeps its own margin.
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressable)
        .foregroundStyle(HausPlatformColor.label)
        .accessibilityLabel("\(server.name) menu")
    }

    private var shadowBleed: some View {
        Color.clear
            .frame(height: Self.shadowBleedHeight)
            .allowsHitTesting(false)
    }

    private var channels: [ChatDestination] {
        destinations.filter { if case .channel = $0.kind { true } else { false } }
    }

    private var directMessages: [ChatDestination] {
        destinations.filter { if case .channel = $0.kind { false } else { true } }
    }

    /// A plain label, not a disclosure. A phone sidebar holds few enough rows
    /// that folding a section saves nothing, and the caret it needed was the
    /// one thing that could not sit on the rail with everything else.
    private func sectionHeader(
        _ title: String,
        trailingAction: (() -> Void)? = nil
    ) -> some View {
        HStack(spacing: 4) {
            Text(title).font(.body).foregroundStyle(HausPlatformColor.secondaryLabel)
            Spacer(minLength: 0)
            if let trailingAction {
                Button(action: trailingAction) {
                    HausIcon(.plus, size: sectionGlyphSize, weight: Self.rowGlyphWeight)
                        .foregroundStyle(HausPlatformColor.secondaryLabel)
                        .frame(minWidth: 44, minHeight: sectionHeaderHeight)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.pressable)
                .accessibilityLabel("New channel")
            }
        }
        .padding(.leading, Self.rowCapsuleBleed)
        .padding(.trailing, trailingAction == nil ? Self.rowCapsuleBleed : 0)
        .frame(minHeight: sectionHeaderHeight)
        .accessibilityAddTraits(.isHeader)
    }

    private func row(_ chat: ChatDestination) -> some View {
        SidebarChatRow(
            chat: chat,
            isSelected: selection == .chat(chat.id),
            metrics: metrics,
            onSelect: { onSelectDestination(chat) },
            onMarkRead: markReadAction(for: chat),
            onOpenDetails: { onOpenDetails(chat) }
        )
    }

    private func markReadAction(for chat: ChatDestination) -> (() -> Void)? {
        guard let onMarkRead, chat.unreadCount > 0, let durable = chat.durableChat else { return nil }
        return { onMarkRead(durable) }
    }
}

#Preview {
    ChatSidebarView(
        server: ChatFixtures.server,
        destinations: ChatFixtures.chats.map(ChatDestination.durableChat),
        selection: .chat(.chat("product")),
        onSelectDestination: { _ in },
        onOpenSettings: {}
    )
    .frame(width: 330)
}
