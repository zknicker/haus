import HausModels
import SwiftUI

/// The Home tab's root. Until Home is rebuilt it hosts the Inbox sections as
/// they were (Today, Active this week, Unread, Happening now) under a stock
/// centered title, with the fresh-Server next steps on top.
public struct HomeTabView: View {
    private let greetingName: String?
    private let agentWeeks: [InboxAgentWeek]?
    private let unread: [InboxUnreadRow]?
    private let cloudAgentWork: [ActiveWorker]?
    private let workingAgents: [InboxWorkingAgent]
    private let resolveActor: InboxActorResolver
    private let firstRun: FirstRunPresentation?
    private let onOpen: (InboxOpenRequest) -> Void
    private let onMarkRead: (String) -> Void
    private let onRefresh: () async -> Void
    private let onNewTask: () -> Void

    @State private var swipedReadFeedback = 0

    public init(
        greetingName: String?,
        agentWeeks: [InboxAgentWeek]?,
        unread: [InboxUnreadRow]?,
        cloudAgentWork: [ActiveWorker]?,
        workingAgents: [InboxWorkingAgent],
        resolveActor: @escaping InboxActorResolver,
        firstRun: FirstRunPresentation?,
        onOpen: @escaping (InboxOpenRequest) -> Void,
        onMarkRead: @escaping (String) -> Void,
        onRefresh: @escaping () async -> Void,
        onNewTask: @escaping () -> Void
    ) {
        self.greetingName = greetingName
        self.agentWeeks = agentWeeks
        self.unread = unread
        self.cloudAgentWork = cloudAgentWork
        self.workingAgents = workingAgents
        self.resolveActor = resolveActor
        self.firstRun = firstRun
        self.onOpen = onOpen
        self.onMarkRead = onMarkRead
        self.onRefresh = onRefresh
        self.onNewTask = onNewTask
    }

    public var body: some View {
        TimelineView(.periodic(from: .now, by: isCountingUp ? 5 : 60)) { context in
            list(now: context.date)
        }
        .scrollContentBackground(.hidden)
        .background(HausPlatformColor.groupedBackground)
        .sensoryFeedback(.success, trigger: swipedReadFeedback)
        .refreshable { await onRefresh() }
        .task { await onRefresh() }
        .navigationTitle("Home")
        .hausInlineNavigationTitle()
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("New task", systemImage: "plus", action: onNewTask)
                    .disabled(firstRun != nil)
            }
        }
    }

    private func list(now: Date) -> some View {
        List {
            if let firstRun {
                Section { FirstRunPanel(firstRun: firstRun).inboxBareRow() }
            }
            if let greetingName {
                Section { greeting(greetingName, now: now).inboxBareRow() }
            }
            InboxActiveAgentsSection(weeks: agentWeeks, onOpen: onOpen)
            InboxUnreadSection(
                rows: unread,
                now: now,
                onOpen: onOpen,
                onMarkRead: onMarkRead,
                onSwipedRead: { swipedReadFeedback += 1 }
            )
            InboxHappeningNowSection(
                rows: InboxHappeningNowRows.rows(
                    work: cloudAgentWork,
                    agents: workingAgents,
                    now: now,
                    resolveActor: resolveActor
                ),
                onOpen: onOpen
            )
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        .listSectionSpacing(InboxMetrics.sectionSpacing)
        #endif
        .environment(\.defaultMinListRowHeight, 0)
        .animation(.default, value: unread?.map(\.id))
    }

    private func greeting(_ name: String, now: Date) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(InboxToday.greeting(name: name, now: now))
                .font(.title3.weight(.semibold))
            Text(InboxToday.dateLabel(now: now))
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, InboxMetrics.rowInset)
    }

    private var isCountingUp: Bool {
        !(cloudAgentWork ?? []).isEmpty || !workingAgents.isEmpty
    }
}
