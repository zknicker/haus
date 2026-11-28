import HausModels

/// The list column while a Task sits beside its conversation (specs/ios-app.md,
/// Task mode): it steps aside to the rail, or hides on a tab with no rail.
/// The reader can still drag it while the Task is open, and closing the Task
/// brings back the column the tab had, which the Task never wrote.
public struct TaskModeColumn: Hashable, Sendable {
    private var chosen: ListColumn?

    public init() {}

    public func shown(_ stored: ListColumn, besideTask: Bool, hasRail: Bool) -> ListColumn {
        guard besideTask else { return stored.shown(hasRail: hasRail) }
        return (chosen ?? (hasRail ? .rail : .hidden)).shown(hasRail: hasRail)
    }

    /// A drag or the sidebar button. Beside a Task it moves only the column
    /// for that Task and returns nil; otherwise it returns the column to keep.
    public mutating func choose(_ column: ListColumn, besideTask: Bool) -> ListColumn? {
        guard besideTask else { return column }
        chosen = column
        return nil
    }

    public mutating func taskClosed() {
        chosen = nil
    }
}
