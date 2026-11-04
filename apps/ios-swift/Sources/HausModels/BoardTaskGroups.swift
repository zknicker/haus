import Foundation

/// One board column and the Tasks in it, in reading order.
public struct BoardColumnGroup: Identifiable, Hashable, Sendable {
    public let column: BoardColumn
    public let tasks: [BoardTask]

    public var id: String { column.id }

    public init(column: BoardColumn, tasks: [BoardTask]) {
        self.column = column
        self.tasks = tasks
    }
}

/// A board's Tasks as the board shows them.
public enum BoardTaskGroups {
    /// Every column in board order, empty ones included, so the shape of the
    /// board does not change with what is on it. A Task naming a column the
    /// board no longer lists is left out until its own read catches up.
    public static func groups(columns: [BoardColumn], tasks: [BoardTask]) -> [BoardColumnGroup] {
        let byColumn = Dictionary(grouping: tasks, by: \.columnID)
        return columns.map { column in
            BoardColumnGroup(column: column, tasks: sorted(byColumn[column.id] ?? [], in: column.category))
        }
    }

    /// Open work reads by priority, then due date, then age: the order an
    /// Agent picks in. Finished work reads newest first.
    public static func sorted(_ tasks: [BoardTask], in category: ColumnCategory) -> [BoardTask] {
        if category.isClosed {
            return tasks.sorted {
                let left = $0.completedAt ?? $0.updatedAt
                let right = $1.completedAt ?? $1.updatedAt
                return left != right ? left > right : $0.number > $1.number
            }
        }
        return tasks.sorted {
            if $0.priority != $1.priority { return $0.priority.sortRank < $1.priority.sortRank }
            // `YYYY-MM-DD` sorts as written; a Task with no date reads last.
            if $0.dueOn != $1.dueOn { return ($0.dueOn ?? "9999") < ($1.dueOn ?? "9999") }
            return $0.number < $1.number
        }
    }

    /// Agents holding more than one active Task, most held first. The Server
    /// does not lock a second one; the board flags it (ADR 0051).
    public static func overloadedAgents(_ tasks: [BoardTask]) -> [(agentID: String, count: Int)] {
        let held = tasks
            .filter { $0.category == .active }
            .compactMap(\.assignee?.agentID)
        return Dictionary(grouping: held, by: { $0 })
            .map { (agentID: $0.key, count: $0.value.count) }
            .filter { $0.count > 1 }
            .sorted { $0.count != $1.count ? $0.count > $1.count : $0.agentID < $1.agentID }
    }

    /// `19 open · 11 done`: canceled work is neither.
    public static func summary(_ tasks: [BoardTask]) -> String {
        let open = tasks.filter { !$0.category.isClosed }.count
        let done = tasks.filter { $0.category == .done }.count
        return "\(open) open · \(done) done"
    }

    /// Tasks per column id, for the column editor's removal rule.
    public static func counts(_ tasks: [BoardTask]) -> [String: Int] {
        tasks.reduce(into: [:]) { counts, task in counts[task.columnID, default: 0] += 1 }
    }
}

/// The board view's reader-side filter. A view of one read rather than a second
/// read: every member sees every Task, so nothing here is a permission.
public struct BoardTaskFilter: Equatable, Sendable {
    public enum Assignee: Hashable, Sendable {
        case anyone
        case unassigned
        case actor(TaskActor)
    }

    public var assignee: Assignee = .anyone
    public var labelID: String?

    public init(assignee: Assignee = .anyone, labelID: String? = nil) {
        self.assignee = assignee
        self.labelID = labelID
    }

    public var isActive: Bool { assignee != .anyone || labelID != nil }

    public func matches(_ task: BoardTask) -> Bool {
        if let labelID, !task.labelIDs.contains(labelID) { return false }
        switch assignee {
        case .anyone: return true
        case .unassigned: return task.assignee == nil
        case .actor(let actor): return task.assignee == actor
        }
    }
}
