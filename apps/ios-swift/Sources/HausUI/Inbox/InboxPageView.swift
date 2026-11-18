import HausModels
import SwiftUI

/// The human Inbox: a lens over records that already exist elsewhere. It owns
/// no state, creates nothing, and rides the Store snapshots its sources already
/// refresh.
///
/// The order is the reading order, and it is the contract the App page states:
/// who is reading and what day it is, then the Agents that moved this week,
/// then the conversations waiting on this person, then what is moving without
/// them.
///
/// A section that has not settled renders nothing rather than an empty box: an
/// unsettled read is not an empty collection, so nothing is claimed — and
/// nothing flashes — on the way there.
///
/// It is the app's landing canvas, not a pushed screen, so it wears no
/// navigation bar and no Back button — there is nothing behind it to return to.
/// What it does wear is the Chat canvas's own leading chrome button, in the
/// same place and at the same size, because the drawer has to stay one tap away
/// from wherever the reader is.
public struct InboxPageView: View {
    private let greetingName: String?
    private let agentWeeks: [InboxAgentWeek]?
    private let unread: [InboxUnreadRow]?
    private let cloudAgentWork: [ActiveCloudAgentWork]?
    private let workingAgents: [InboxWorkingAgent]
    private let resolveActor: InboxActorResolver
    private let onOpen: (InboxOpenRequest) -> Void
    private let onMarkRead: (String) -> Void
    private let onRefresh: () async -> Void
    private let onOpenSidebar: () -> Void
    /// The canvas ignores safe areas, so the chrome row carries its own
    /// status-bar clearance exactly as the Chat screen's does.
    private let contentInsets: EdgeInsets

    /// Elapsed time ticks on the rows that are counting up, and only on them.
    @State private var now = Date.now
    /// Ticks once per swipe that marks a row read: the swipe commits under the
    /// finger, so it confirms by touch.
    @State private var swipedReadFeedback = 0

    public init(
        greetingName: String?,
        agentWeeks: [InboxAgentWeek]?,
        unread: [InboxUnreadRow]?,
        cloudAgentWork: [ActiveCloudAgentWork]?,
        workingAgents: [InboxWorkingAgent],
        resolveActor: @escaping InboxActorResolver,
        onOpen: @escaping (InboxOpenRequest) -> Void,
        onMarkRead: @escaping (String) -> Void,
        onRefresh: @escaping () async -> Void,
        onOpenSidebar: @escaping () -> Void,
        contentInsets: EdgeInsets = EdgeInsets()
    ) {
        self.greetingName = greetingName
        self.agentWeeks = agentWeeks
        self.unread = unread
        self.cloudAgentWork = cloudAgentWork
        self.workingAgents = workingAgents
        self.resolveActor = resolveActor
        self.onOpen = onOpen
        self.onMarkRead = onMarkRead
        self.onRefresh = onRefresh
        self.onOpenSidebar = onOpenSidebar
        self.contentInsets = contentInsets
    }

    public var body: some View {
        page
            // A bar, not a plain inset: the soft scroll edge below the chrome
            // only paints behind a region the scroll view knows is one.
            .chromeBar(edge: .top, spacing: 0) {
                ChromeHeader {
                    GlassChromeButton(.sidebar, label: "Open navigation", action: onOpenSidebar)
                } trailing: {
                    EmptyView()
                }
                .padding(.top, contentInsets.top)
            }
    }

    /// A stock inset-grouped List, so an Unread row's swipe, its removal, and
    /// pull-to-refresh are the system's own. The greeting rides a bare row;
    /// each section is a List `Section` on the grouped surface.
    private var page: some View {
        List {
            if greetingName != nil {
                Section { header.inboxBareRow() }
            }
            InboxActiveAgentsSection(weeks: agentWeeks, onOpen: onOpen)
            InboxUnreadSection(
                rows: unread,
                now: now,
                onOpen: onOpen,
                onMarkRead: onMarkRead,
                onSwipedRead: { swipedReadFeedback += 1 }
            )
            InboxHappeningNowSection(rows: happeningNowRows, onOpen: onOpen)
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        .listSectionSpacing(InboxMetrics.sectionSpacing)
        #endif
        .environment(\.defaultMinListRowHeight, 0)
        .scrollContentBackground(.hidden)
        .background(HausPlatformColor.groupedBackground)
        .contentMargins(.top, 4, for: .scrollContent)
        .contentMargins(.bottom, 28 + contentInsets.bottom, for: .scrollContent)
        // A swipe or a Mark read removes the row in the Store's next turn; the
        // List animates that diff as its own row deletion.
        .animation(.default, value: unread?.map(\.id))
        .sensoryFeedback(.success, trigger: swipedReadFeedback)
        .refreshable { await onRefresh() }
        .task { await onRefresh() }
        .task(id: isCountingUp) { await tick() }
    }

    /// The page's opening line: who is reading, and what day it is. It is the
    /// one place the Inbox addresses the person rather than the work, so it is
    /// a line and a date — no card around it, and no poster type.
    ///
    /// A greeting needs a name, so nothing renders until the member directory
    /// lands: a bare "Good afternoon" addresses nobody, and a date that jumps
    /// down a line when the name arrives is worse than a beat of blank.
    @ViewBuilder
    private var header: some View {
        if let greetingName {
            VStack(alignment: .leading, spacing: 2) {
                Text(InboxToday.greeting(name: greetingName, now: now))
                    .font(.title3.weight(.semibold))
                Text(InboxToday.dateLabel(now: now))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, InboxMetrics.rowInset)
        }
    }

    private var happeningNowRows: [InboxHappeningNowRow]? {
        InboxHappeningNowRows.rows(
            work: cloudAgentWork,
            agents: workingAgents,
            now: now,
            resolveActor: resolveActor
        )
    }

    private var isCountingUp: Bool {
        !(cloudAgentWork ?? []).isEmpty || !workingAgents.isEmpty
    }

    private func tick() async {
        let interval: Duration = isCountingUp ? .seconds(5) : .seconds(60)
        while !Task.isCancelled {
            try? await Task.sleep(for: interval)
            guard !Task.isCancelled else { return }
            now = .now
        }
    }
}
