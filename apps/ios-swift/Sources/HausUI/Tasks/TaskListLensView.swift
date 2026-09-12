import HausModels
import SwiftUI

/// A native, grouped Tasks lens over the canonical `task.list` projection.
///
/// The list is deliberately display-first: opening a row delegates to the
/// existing Thread route, while lifecycle controls call explicit callbacks so
/// the App layer can perform Server mutations and replace the row with the
/// returned authoritative version.
public struct TaskListLensView: View {
    private let items: [TaskListItem]
    private let viewerUserID: String?
    private let chatLabel: (TaskListItem) -> String
    private let assignee: (TaskListItem) -> MessageAuthorPresentation?
    private let mutatingIDs: Set<String>
    private let actionsDisabled: Bool
    private let onOpenTask: (TaskListItem) -> Void
    private let onUpdateStatus: (TaskListItem, TaskStatus) -> Void
    private let onClaim: (TaskListItem) -> Void
    private let onUnclaim: (TaskListItem) -> Void

    public init(
        items: [TaskListItem],
        viewerUserID: String? = nil,
        chatLabel: ((TaskListItem) -> String)? = nil,
        assignee: ((TaskListItem) -> MessageAuthorPresentation?)? = nil,
        mutatingIDs: Set<String> = [],
        actionsDisabled: Bool = false,
        onOpenTask: @escaping (TaskListItem) -> Void,
        onUpdateStatus: @escaping (TaskListItem, TaskStatus) -> Void = { _, _ in },
        onClaim: @escaping (TaskListItem) -> Void = { _ in },
        onUnclaim: @escaping (TaskListItem) -> Void = { _ in }
    ) {
        self.items = items
        self.viewerUserID = viewerUserID
        self.chatLabel = chatLabel ?? defaultTaskChatLabel
        self.assignee = assignee ?? { _ in nil }
        self.mutatingIDs = mutatingIDs
        self.actionsDisabled = actionsDisabled
        self.onOpenTask = onOpenTask
        self.onUpdateStatus = onUpdateStatus
        self.onClaim = onClaim
        self.onUnclaim = onUnclaim
    }

    public var body: some View {
        Group {
            if items.isEmpty {
                ContentUnavailableView(
                    "No tasks",
                    systemImage: "checklist",
                    description: Text("Tasks created from Haus messages will appear here.")
                )
            } else {
                List {
                    ForEach(Array(statusGroups.enumerated()), id: \.element.status) { index, group in
                        Section {
                            ForEach(group.items) { item in
                                TaskListRow(
                                    item: item,
                                    viewerUserID: viewerUserID,
                                    chatLabel: chatLabel(item),
                                    assignee: assignee(item),
                                    isMutating: mutatingIDs.contains(item.id),
                                    actionsDisabled: actionsDisabled,
                                    onOpen: { onOpenTask(item) },
                                    onUpdateStatus: { onUpdateStatus(item, $0) },
                                    onClaim: { onClaim(item) },
                                    onUnclaim: { onUnclaim(item) }
                                )
                                .listRowInsets(
                                    EdgeInsets(
                                        top: 12,
                                        leading: TaskListMetrics.horizontalInset,
                                        bottom: 12,
                                        trailing: TaskListMetrics.horizontalInset
                                    )
                                )
                                .listRowBackground(HausPlatformColor.background)
                                // Linear mobile rules the section boundary, not
                                // the gaps between rows inside a group.
                                .listRowSeparator(.hidden)
                            }
                        } header: {
                            TaskSectionHeader(
                                status: group.status,
                                count: group.items.count,
                                showsBoundaryRule: index > 0
                            )
                            // The header owns its own padding so its boundary
                            // rule can bleed the full width of the screen.
                            .listRowInsets(EdgeInsets())
                        }
                    }
                }
                .listStyle(.plain)
                .hausCompactListSections()
                .scrollContentBackground(.hidden)
            }
        }
        // The hosting destination owns the navigation title.
        .background(HausPlatformColor.background)
    }

    /// The non-empty status groups in canonical order.
    ///
    /// Materializing them lets the first section skip the boundary rule that
    /// every later header carries.
    private var statusGroups: [(status: TaskStatus, items: [TaskListItem])] {
        TaskStatus.ordered.compactMap { status in
            let groupedItems = items.filter { $0.task.status == status }
            return groupedItems.isEmpty ? nil : (status: status, items: groupedItems)
        }
    }
}

#Preview("Tasks") {
    NavigationStack {
        TaskListLensView(
            items: TaskPreviewFixtures.items,
            viewerUserID: "user_preview",
            onOpenTask: { _ in }
        )
    }
}
