import HausModels
import SwiftUI

/// The Tasks tab's root. Until Tasks is rebuilt it lists the followed Tasks
/// with unread messages, as the Inbox did, or the open Tasks assigned to the
/// viewer.
public struct TasksTabView: View {
    private let unreadTasks: [InboxUnreadRow]?
    private let assigned: [TaskRecord]?
    @Binding private var isAssignedToMe: Bool
    private let onOpen: (InboxOpenRequest) -> Void
    private let onMarkRead: (String) -> Void
    private let onRefresh: () async -> Void

    public init(
        unreadTasks: [InboxUnreadRow]?,
        assigned: [TaskRecord]?,
        isAssignedToMe: Binding<Bool>,
        onOpen: @escaping (InboxOpenRequest) -> Void,
        onMarkRead: @escaping (String) -> Void,
        onRefresh: @escaping () async -> Void
    ) {
        self.unreadTasks = unreadTasks
        self.assigned = assigned
        _isAssignedToMe = isAssignedToMe
        self.onOpen = onOpen
        self.onMarkRead = onMarkRead
        self.onRefresh = onRefresh
    }

    public var body: some View {
        List {
            Section {
                HStack(spacing: 8) {
                    FilterChip("Following", isSelected: !isAssignedToMe) { isAssignedToMe = false }
                    FilterChip("Assigned to me", isSelected: isAssignedToMe) { isAssignedToMe = true }
                }
                .padding(.horizontal, InboxMetrics.rowInset)
                .inboxBareRow()
            }
            if isAssignedToMe {
                assignedSection
            } else {
                InboxUnreadSection(rows: unreadTasks, now: .now, onOpen: onOpen, onMarkRead: onMarkRead)
            }
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        .listSectionSpacing(InboxMetrics.sectionSpacing)
        #endif
        .environment(\.defaultMinListRowHeight, 0)
        .scrollContentBackground(.hidden)
        .background(HausPlatformColor.groupedBackground)
        .refreshable { await onRefresh() }
        .task(id: isAssignedToMe) { await onRefresh() }
        .navigationTitle("Tasks")
        .hausInlineNavigationTitle()
    }

    @ViewBuilder
    private var assignedSection: some View {
        if let assigned {
            InboxSectionView(title: "Assigned to me") {
                if assigned.isEmpty {
                    InboxSectionEmpty(description: "Nothing assigned to you.")
                } else {
                    ForEach(assigned) { task in
                        Button { onOpen(.task(taskID: task.id)) } label: { taskRow(task) }
                            .buttonStyle(.plain)
                            .inboxCardRow()
                    }
                }
            }
        }
    }

    private func taskRow(_ task: TaskRecord) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            TaskStateDisc(state: task.state, size: 16)
            VStack(alignment: .leading, spacing: 2) {
                Text(task.title)
                    .lineLimit(2)
                Text(task.key)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, InboxMetrics.rowInset)
        .padding(.vertical, InboxMetrics.rowVerticalPadding)
        .contentShape(Rectangle())
    }
}
