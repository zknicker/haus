import Foundation
import HausModels

/// One state group in the Tasks tab: "In progress 3".
public struct TaskBoardSection: Identifiable, Equatable, Sendable {
    public enum Kind: String, CaseIterable, Sendable {
        case waitingOnYou
        case inProgress
        case todo
        case done
        case canceled

        public var title: String {
            switch self {
            case .waitingOnYou: "Waiting on you"
            case .inProgress: "In progress"
            case .todo: "Todo"
            case .done: "Done"
            case .canceled: "Canceled"
            }
        }
    }

    public let kind: Kind
    public let tasks: [TaskRecord]

    public var id: Kind { kind }
    public var title: String { kind.title }
}

/// Groups a filtered list by state, in the order a reader works it: what is
/// waiting on them, what is moving, what is next, then what has ended. Empty
/// groups are left out.
public enum TaskBoardSections {
    public static func sections(
        _ tasks: [TaskRecord],
        filter: TaskBoardFilter,
        scope: TaskBoardScopeContext,
        waitingOnYou: Set<String>,
        ordering: TaskBoardOrdering = .newest
    ) -> [TaskBoardSection] {
        let admitted = tasks.filter { filter.admits($0, scope: scope) }
        let grouped = Dictionary(grouping: admitted) { kind(of: $0, waitingOnYou: waitingOnYou) }
        return TaskBoardSection.Kind.allCases.compactMap { kind in
            guard let members = grouped[kind], !members.isEmpty else { return nil }
            return TaskBoardSection(kind: kind, tasks: ordered(members, by: ordering))
        }
    }

    static func kind(of task: TaskRecord, waitingOnYou: Set<String>) -> TaskBoardSection.Kind {
        switch task.state {
        case .done: .done
        case .canceled: .canceled
        case .open: waitingOnYou.contains(task.id) ? .waitingOnYou : .inProgress
        case .todo, .unknown: waitingOnYou.contains(task.id) ? .waitingOnYou : .todo
        }
    }

    /// Newest first, as the App's Tasks page orders; by priority, most urgent
    /// first and unset last, then newest.
    static func ordered(_ tasks: [TaskRecord], by ordering: TaskBoardOrdering) -> [TaskRecord] {
        tasks.sorted { a, b in
            if ordering == .priority, a.priority.rank != b.priority.rank {
                return a.priority.rank < b.priority.rank
            }
            let aDate = a.completedAt ?? a.createdAt
            let bDate = b.completedAt ?? b.createdAt
            if aDate != bDate { return aDate > bDate }
            return a.key.localizedStandardCompare(b.key) == .orderedAscending
        }
    }
}

extension TaskPriority {
    /// Most urgent first, unset last: the order an Agent picks its next Task in.
    var rank: Int {
        switch self {
        case .urgent: 0
        case .high: 1
        case .medium: 2
        case .low: 3
        case .none: 4
        }
    }

    /// The picker order the App uses: unset first, then most urgent down.
    static let pickerOrder: [TaskPriority] = [.none, .urgent, .high, .medium, .low]
}
