/// The Tasks tab's lists, as the web App's Tasks page names them. It lives
/// below the UI so the router can carry the list in view.
public enum TaskListView: CaseIterable, Hashable, Sendable {
    /// Active Tasks the reader started.
    case mine
    /// Every active Task.
    case all
    case archived

    public var title: String {
        switch self {
        case .mine: "My tasks"
        case .all: "All tasks"
        case .archived: "Archived"
        }
    }

    /// Whether the list reads `task.list` with `archived: true`.
    public var isArchived: Bool { self == .archived }
}
