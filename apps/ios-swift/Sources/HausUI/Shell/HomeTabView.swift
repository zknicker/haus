import HausModels
import SwiftUI

/// The Home tab's root: Captain tiles, then Recent and the active Tasks as
/// plain sections. Unread Chats and followed Task chats surface in Recent; a
/// fresh Server shows its next steps first.
public struct HomeTabView: View {
    private let firstRun: FirstRunPresentation?
    private let tiles: [CaptainTilePresentation]
    private let recent: [HomeRowPresentation]?
    private let activeTasks: [HomeRowPresentation]?
    /// The row the content pane beside the list shows.
    private let selected: HomeRowTarget?
    private let tileActions: CaptainTileActions
    private let onOpen: (HomeRowTarget) -> Void
    private let onMarkRead: (String) -> Void
    private let onRefresh: () async -> Void
    private let onNewCaptain: (() -> Void)?

    public init(
        firstRun: FirstRunPresentation?,
        tiles: [CaptainTilePresentation],
        recent: [HomeRowPresentation]?,
        activeTasks: [HomeRowPresentation]?,
        selected: HomeRowTarget? = nil,
        tileActions: CaptainTileActions,
        onOpen: @escaping (HomeRowTarget) -> Void,
        onMarkRead: @escaping (String) -> Void,
        onRefresh: @escaping () async -> Void,
        onNewCaptain: (() -> Void)?
    ) {
        self.firstRun = firstRun
        self.tiles = tiles
        self.recent = recent
        self.activeTasks = activeTasks
        self.selected = selected
        self.tileActions = tileActions
        self.onOpen = onOpen
        self.onMarkRead = onMarkRead
        self.onRefresh = onRefresh
        self.onNewCaptain = onNewCaptain
    }

    public var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            list(now: context.date)
        }
        .scrollContentBackground(.hidden)
        .background(HausPlatformColor.canvas)
        .refreshable { await onRefresh() }
        .task { await onRefresh() }
        .hausScreenTitle("Home")
        .toolbar {
            if let onNewCaptain {
                ToolbarItem(placement: .primaryAction) {
                    Button("New Captain", systemImage: "plus", action: onNewCaptain)
                        .hausHeaderGlyph()
                }
            }
        }
    }

    private func list(now: Date) -> some View {
        List {
            if let firstRun {
                FirstRunPanel(firstRun: firstRun).hausPlainRow()
            }
            if !tiles.isEmpty {
                CaptainTilesGrid(tiles: tiles, actions: tileActions)
                    .padding(.top, 8)
                    .hausPlainRow()
            }
            if let recent, !recent.isEmpty {
                SectionCountLabel("Recent").hausSectionLabelRow()
                ForEach(recent) { row($0, now: now) }
            }
            if let activeTasks, !activeTasks.isEmpty {
                SectionCountLabel("Tasks", count: activeTasks.count).hausSectionLabelRow()
                ForEach(activeTasks) { row($0, now: now) }
            }
        }
        .listStyle(.plain)
        .reportsChromeScroll()
        .environment(\.defaultMinListRowHeight, 0)
        .animation(.default, value: recent)
        .animation(.default, value: activeTasks)
    }

    private func row(_ row: HomeRowPresentation, now: Date) -> some View {
        Button { onOpen(row.target) } label: {
            HomeRow(row: row, now: now)
        }
        .buttonStyle(.plain)
        .listSelection(selected != nil && row.target == selected)
        .hausPlainRow()
        .swipeActions(edge: .trailing) {
            if let chatID = row.markReadChatID {
                Button("Mark Read", systemImage: "envelope.open") { onMarkRead(chatID) }
                    .tint(HausPlatformColor.accent)
            }
        }
        .contextMenu {
            if let chatID = row.markReadChatID {
                Button("Mark Read", systemImage: "envelope.open") { onMarkRead(chatID) }
            }
        }
    }
}
