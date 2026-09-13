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
    /// The task a route sent the reader to. The list scrolls it into view and
    /// marks it for a moment; it is not a selection, and nothing stays picked.
    private let focus: TaskFocus?
    private let chatLabel: (TaskListItem) -> String
    private let assignee: (TaskListItem) -> MessageAuthorPresentation?
    private let mutatingIDs: Set<String>
    private let actionsDisabled: Bool
    private let onOpenTask: (TaskListItem) -> Void
    private let onUpdateStatus: (TaskListItem, TaskStatus) -> Void
    private let onClaim: (TaskListItem) -> Void
    private let onUnclaim: (TaskListItem) -> Void

    /// The focused row's moment of highlight, which fades on its own.
    @State private var markedID: String?

    public init(
        items: [TaskListItem],
        viewerUserID: String? = nil,
        focus: TaskFocus? = nil,
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
        self.focus = focus
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
                ScrollViewReader { proxy in
                    list
                        .task(id: focusedRowID) { await reveal(with: proxy) }
                }
            }
        }
        // The hosting destination owns the navigation title.
        .background(HausPlatformColor.background)
    }

    private var list: some View {
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
                        .listRowBackground(rowBackground(item))
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

    /// The focused task, once the lens actually holds it. A focus the current
    /// lens has not loaded yet is nothing to scroll to, and the destination is
    /// already widening the lens for it.
    private var focusedRowID: String? {
        guard let focus, items.contains(where: { $0.id == focus.messageID }) else { return nil }
        return focus.messageID
    }

    /// Land on the task the route named: scroll it under the reader's eye and
    /// mark it with the same wash a press leaves, so they see which row they
    /// were sent to rather than having to find it in a list they did not scroll.
    private func reveal(with proxy: ScrollViewProxy) async {
        guard let focusedRowID else {
            markedID = nil
            return
        }
        withAnimation(.easeInOut(duration: 0.3)) {
            proxy.scrollTo(focusedRowID, anchor: .center)
            markedID = focusedRowID
        }
        try? await Task.sleep(for: .seconds(1.6))
        guard !Task.isCancelled else { return }
        withAnimation(.easeOut(duration: 0.45)) { markedID = nil }
    }

    /// The press wash the row already takes, held for a moment rather than for
    /// the length of a finger.
    private func rowBackground(_ item: TaskListItem) -> some View {
        HausPlatformColor.background
            .overlay(HausPlatformColor.label.opacity(markedID == item.id ? 0.06 : 0))
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
