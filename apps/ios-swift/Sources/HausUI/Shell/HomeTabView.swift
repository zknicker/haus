import HausModels
import SwiftUI

/// The Home tab's root: Captain tiles, then Happening now, Recent, and Open
/// tasks as plain sections. Unread Chats and followed Task chats surface in
/// Recent; a fresh Server shows its next steps first.
public struct HomeTabView: View {
    private let firstRun: FirstRunPresentation?
    private let tiles: [CaptainTilePresentation]
    private let workers: [ActiveWorker]?
    private let recent: [HomeRowPresentation]?
    private let openTasks: [HomeRowPresentation]?
    private let tileActions: CaptainTileActions
    private let onOpen: (HomeRowTarget) -> Void
    private let onOpenWorker: (ActiveWorker) -> Void
    private let onMarkRead: (String) -> Void
    private let onRefresh: () async -> Void
    private let onNewCaptain: (() -> Void)?

    public init(
        firstRun: FirstRunPresentation?,
        tiles: [CaptainTilePresentation],
        workers: [ActiveWorker]?,
        recent: [HomeRowPresentation]?,
        openTasks: [HomeRowPresentation]?,
        tileActions: CaptainTileActions,
        onOpen: @escaping (HomeRowTarget) -> Void,
        onOpenWorker: @escaping (ActiveWorker) -> Void,
        onMarkRead: @escaping (String) -> Void,
        onRefresh: @escaping () async -> Void,
        onNewCaptain: (() -> Void)?
    ) {
        self.firstRun = firstRun
        self.tiles = tiles
        self.workers = workers
        self.recent = recent
        self.openTasks = openTasks
        self.tileActions = tileActions
        self.onOpen = onOpen
        self.onOpenWorker = onOpenWorker
        self.onMarkRead = onMarkRead
        self.onRefresh = onRefresh
        self.onNewCaptain = onNewCaptain
    }

    public var body: some View {
        TimelineView(.periodic(from: .now, by: workers?.isEmpty == false ? 5 : 60)) { context in
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
            if let workers, !workers.isEmpty {
                SectionCountLabel("Happening now").hausSectionLabelRow()
                ForEach(workers) { worker in
                    WorkerRow(WorkerRowPresentation(worker: worker.work, taskKey: worker.taskKey, now: now)) {
                        onOpenWorker(worker)
                    }
                    .hausPlainRow()
                }
            }
            if let recent, !recent.isEmpty {
                SectionCountLabel("Recent").hausSectionLabelRow()
                ForEach(recent) { row($0, now: now) }
            }
            if let openTasks, !openTasks.isEmpty {
                SectionCountLabel("Open tasks", count: openTasks.count).hausSectionLabelRow()
                ForEach(openTasks) { row($0, now: now) }
            }
        }
        .listStyle(.plain)
        .reportsChromeScroll()
        .environment(\.defaultMinListRowHeight, 0)
        .animation(.default, value: recent)
        .animation(.default, value: openTasks)
    }

    private func row(_ row: HomeRowPresentation, now: Date) -> some View {
        Button { onOpen(row.target) } label: {
            HomeRow(row: row, now: now)
        }
        .buttonStyle(.plain)
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
