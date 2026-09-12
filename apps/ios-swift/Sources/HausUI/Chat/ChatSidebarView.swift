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
    /// Every row leads with a glyph in a box this size, so the labels behind
    /// them share one column too.
    private static let rowGlyphSize: CGFloat = 26
    /// The Inbox mark's drawn height — the App sidebar's own number for the
    /// same row, and a size above the boxed glyphs below it.
    private static let inboxGhostSize: CGFloat = 22
    /// The family's own 1.5 reads thin against a row's body text.
    private static let rowGlyphWeight: CGFloat = 1.8
    /// The unread marker is a disc centred on the sidebar's leading edge, so
    /// only its trailing half shows — Discord's nub. Half of this is what the
    /// reader actually sees.
    private static let unreadMarkerDiameter: CGFloat = 14

    private let server: ServerPresentation
    private let destinations: [ChatDestination]
    private let selectedDestinationID: ChatDestination.ID?
    private let onSelectDestination: (ChatDestination) -> Void
    private let onOpenSettings: () -> Void
    private let onOpenSearch: () -> Void
    private let onOpenInbox: () -> Void
    /// The Inbox's own "Needs you" total, in the same chip the Chat rows wear
    /// for unread messages and, like them, absent at zero.
    private let needsYouCount: Int
    /// How fast the Inbox mark's mesh drifts: `lively` only while an Agent on
    /// this Server is working.
    private let ghostTempo: HausGhostTempo
    private let onOpenTasks: () -> Void
    private let onOpenArchived: () -> Void
    private let onOpenNewChannel: () -> Void

    @Environment(\.colorScheme) private var colorScheme

    public init(
        server: ServerPresentation,
        destinations: [ChatDestination],
        selectedDestinationID: ChatDestination.ID?,
        onSelectDestination: @escaping (ChatDestination) -> Void,
        onOpenSettings: @escaping () -> Void,
        onOpenSearch: @escaping () -> Void = {},
        onOpenInbox: @escaping () -> Void = {},
        needsYouCount: Int = 0,
        ghostTempo: HausGhostTempo = .calm,
        onOpenTasks: @escaping () -> Void = {},
        onOpenArchived: @escaping () -> Void = {},
        onOpenNewChannel: @escaping () -> Void = {}
    ) {
        self.server = server
        self.destinations = destinations
        self.selectedDestinationID = selectedDestinationID
        self.onSelectDestination = onSelectDestination
        self.onOpenSettings = onOpenSettings
        self.onOpenSearch = onOpenSearch
        self.onOpenInbox = onOpenInbox
        self.needsYouCount = needsYouCount
        self.ghostTempo = ghostTempo
        self.onOpenTasks = onOpenTasks
        self.onOpenArchived = onOpenArchived
        self.onOpenNewChannel = onOpenNewChannel
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
                                needsYouCount: needsYouCount,
                                glyphSize: Self.inboxGhostSize,
                                ghostTempo: ghostTempo,
                                glyphColumn: Self.rowGlyphSize,
                                capsuleBleed: Self.rowCapsuleBleed,
                                onOpen: onOpenInbox
                            )

                            SidebarUtilityRow(
                                title: "Tasks",
                                icon: .tasks,
                                glyphColumn: Self.rowGlyphSize,
                                capsuleBleed: Self.rowCapsuleBleed,
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
                        // view: the scroll view has to reach the sidebar's own
                        // leading edge, because that edge is what cuts the
                        // unread markers in half.
                        .padding(.horizontal, Self.listInset)
                        .padding(.bottom, 72)
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
            Text(title).font(.body).foregroundStyle(.secondary)
            Spacer(minLength: 0)
            if let trailingAction {
                Button(action: trailingAction) {
                    HausIcon(.plus, size: 17, weight: Self.rowGlyphWeight)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.pressable)
                .accessibilityLabel("New channel")
            }
        }
        .padding(.horizontal, Self.rowCapsuleBleed)
        .frame(height: 34)
    }

    /// Dark mode reads `Color.primary.opacity` too faintly against a near-black
    /// background, so the selected row needs more presence there than light
    /// mode needs.
    private var selectedRowFill: Color {
        colorScheme == .dark ? Color.primary.opacity(0.12) : Color.primary.opacity(0.045)
    }

    private func row(_ chat: ChatDestination) -> some View {
        Button { onSelectDestination(chat) } label: {
            HStack(spacing: 10) {
                chatIcon(chat)
                Text(chat.title)
                    .fontWeight(chat.unreadCount > 0 ? .semibold : .regular)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, Self.rowCapsuleBleed)
            .frame(height: 42)
            .background(
                selectedDestinationID == chat.id ? selectedRowFill : .clear,
                in: .capsule
            )
            // Pushed out until its centre lands on the sidebar's leading
            // edge, where the scroll view's clip takes the other half.
            .overlay(alignment: .leading) {
                if chat.unreadCount > 0 {
                    Circle()
                        .fill(.primary)
                        .frame(
                            width: Self.unreadMarkerDiameter,
                            height: Self.unreadMarkerDiameter
                        )
                        .offset(x: -Self.listInset - Self.unreadMarkerDiameter / 2)
                }
            }
            // The label's own drawing stops at the title, so without this the
            // tappable area is the glyph and the text rather than the row.
            .contentShape(Rectangle())
        }
        // The row's own selection fill is a capsule at this height, so the
        // press highlight matches its curve instead of drawing square corners.
        .buttonStyle(.pressableRow(cornerRadius: 21))
        .accessibilityLabel(chat.unreadCount > 0 ? "\(chat.title), unread" : chat.title)
    }

    @ViewBuilder
    private func chatIcon(_ chat: ChatDestination) -> some View {
        switch chat.kind {
        case .channel:
            ChannelIconBox(appearance: chat.appearance, size: Self.rowGlyphSize)
        case .agentDirectMessage(let agent):
            AvatarView(
                name: agent.name,
                url: agent.avatarURL,
                presence: agent.presence,
                size: Self.rowGlyphSize
            )
        case .humanDirectMessage(let human):
            AvatarView(
                name: human.name,
                url: human.avatarURL,
                presence: nil,
                size: Self.rowGlyphSize
            )
        }
    }
}

#Preview {
    ChatSidebarView(
        server: ChatFixtures.server,
        destinations: ChatFixtures.chats.map(ChatDestination.durableChat),
        selectedDestinationID: .chat("product"),
        onSelectDestination: { _ in },
        onOpenSettings: {}
    )
    .frame(width: 330)
}
