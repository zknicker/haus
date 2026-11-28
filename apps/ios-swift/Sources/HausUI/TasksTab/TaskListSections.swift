import Foundation
import HausModels

/// One section of the Tasks tab: an activity status's active Tasks, or the
/// archived ones.
public struct TaskListSection: Identifiable, Hashable, Sendable {
    public let disc: TaskDiscState
    public let tasks: [TaskRecord]

    public var id: TaskDiscState { disc }
    public var title: String { disc.label }
}

/// How the Tasks tab groups a `task.list` answer.
///
/// A list keeps the web App's Tasks page order: newest first by when each
/// started, or for archived Tasks when each was archived. Active lists group
/// by activity, the Tasks that need the reader first.
public enum TaskListSections {
    public static let statusOrder: [TaskActivityStatus] = [.needsYou, .working, .waiting, .failed, .idle]

    public static func sections(_ tasks: [TaskRecord], view: TaskListView, viewerUserID: String?) -> [TaskListSection] {
        let shown = ordered(filter(tasks, view: view, viewerUserID: viewerUserID))
        guard !view.isArchived else {
            return shown.isEmpty ? [] : [TaskListSection(disc: .archived, tasks: shown)]
        }
        let grouped = Dictionary(grouping: shown.filter { !$0.isArchived }, by: \.status)
        return statusOrder.compactMap { status in
            grouped[status].map { TaskListSection(disc: .active(status), tasks: $0) }
        }
    }

    /// My tasks are the ones the reader started; every other view lists all.
    static func filter(_ tasks: [TaskRecord], view: TaskListView, viewerUserID: String?) -> [TaskRecord] {
        guard view == .mine else { return tasks }
        return tasks.filter { $0.createdBy.userID != nil && $0.createdBy.userID == viewerUserID }
    }

    /// The web App's `orderTasksForPage`.
    static func ordered(_ tasks: [TaskRecord]) -> [TaskRecord] {
        tasks.sorted { left, right in
            let leftAt = left.archivedAt ?? left.createdAt
            let rightAt = right.archivedAt ?? right.createdAt
            return leftAt == rightAt ? left.shortID < right.shortID : leftAt > rightAt
        }
    }

    public static func emptyTitle(_ view: TaskListView) -> String {
        view.isArchived ? "No archived tasks" : "No tasks yet"
    }

    public static func emptyMessage(_ view: TaskListView) -> String? {
        view.isArchived ? nil : "Start one from Home, or ask a Captain to."
    }
}
