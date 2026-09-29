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
    private let chatLabel: (TaskListItem) -> String
    private let assignee: (TaskListItem) -> MessageAuthorPresentation?
    private let mutatingIDs: Set<String>
    private let onOpenTask: (TaskListItem) -> Void
    private let onUpdateStatus: (TaskListItem, TaskStatus) -> Void

    public init(
        items: [TaskListItem],
        chatLabel: ((TaskListItem) -> String)? = nil,
        assignee: ((TaskListItem) -> MessageAuthorPresentation?)? = nil,
        mutatingIDs: Set<String> = [],
        onOpenTask: @escaping (TaskListItem) -> Void,
        onUpdateStatus: @escaping (TaskListItem, TaskStatus) -> Void = { _, _ in }
    ) {
        self.items = items
        self.chatLabel = chatLabel ?? defaultTaskChatLabel
        self.assignee = assignee ?? { _ in nil }
        self.mutatingIDs = mutatingIDs
        self.onOpenTask = onOpenTask
        self.onUpdateStatus = onUpdateStatus
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
                list
            }
        }
        // The hosting destination owns the navigation title.
        .background(HausPlatformColor.background)
    }

    private var list: some View {
        List {
            ForEach(Array(groups.enumerated()), id: \.element.group) { index, group in
                Section {
                    ForEach(group.items) { item in
                        TaskListRow(
                            item: item,
                            chatLabel: chatLabel(item),
                            assignee: assignee(item),
                            isMutating: mutatingIDs.contains(item.id),
                            onOpen: { onOpenTask(item) },
                            onUpdateStatus: { onUpdateStatus(item, $0) }
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
                        title: group.group.title,
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

    /// The non-empty groups in the App's List order: **Needs your review**,
    /// then **Stopped before finishing**, then the lifecycle.
    ///
    /// Materializing them lets the first section skip the boundary rule that
    /// every later header carries.
    private var groups: [(group: TaskListGroup, items: [TaskListItem])] {
        TaskListGroup.grouped(items)
    }
}

#Preview("Tasks") {
    NavigationStack {
        TaskListLensView(
            items: TaskPreviewFixtures.items,
            onOpenTask: { _ in }
        )
    }
}
