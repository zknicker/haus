import Foundation
import HausModels

/// The "Open ⌄" chip: which Task states the list asks the Server for.
public enum TaskBoardStateChoice: String, CaseIterable, Hashable, Sendable {
    case open
    case todo
    case inProgress
    case done
    case canceled
    case all

    public var title: String {
        switch self {
        case .open: "Open"
        case .todo: "Todo"
        case .inProgress: "In progress"
        case .done: "Done"
        case .canceled: "Canceled"
        case .all: "All"
        }
    }

    /// The `task.list` states, or nil for every state.
    public var states: [TaskTargetState]? {
        switch self {
        case .open: [.todo, .open]
        case .todo: [.todo]
        case .inProgress: [.open]
        case .done: [.done]
        case .canceled: [.canceled]
        case .all: nil
        }
    }
}

/// The "Mine ⌄" chip: whose Tasks the list shows.
public enum TaskBoardScope: String, CaseIterable, Hashable, Sendable {
    /// Tasks you or your Captains started, and Tasks assigned to you.
    case mine
    /// Tasks assigned to you; the landing for a burst of assignment pushes.
    case assignedToMe
    case everyone

    public var title: String {
        switch self {
        case .mine: "Mine"
        case .assignedToMe: "Assigned to me"
        case .everyone: "Everyone"
        }
    }
}

/// A "+ Filter" assignee: someone, or nobody.
public enum TaskBoardAssigneeChoice: Hashable, Sendable {
    case actor(TaskActor)
    case unassigned
}

/// Everything the Tasks tab filters by. The Server answers the states, the
/// assignee, and the Project; the scope and the label narrow that answer here,
/// as the App's Tasks page narrows by label.
public struct TaskBoardFilter: Hashable, Sendable {
    public var state: TaskBoardStateChoice
    public var scope: TaskBoardScope
    public var project: TaskProjectOption?
    public var assignee: TaskBoardAssigneeChoice?
    public var labelID: String?

    public init(
        state: TaskBoardStateChoice = .open,
        scope: TaskBoardScope = .mine,
        project: TaskProjectOption? = nil,
        assignee: TaskBoardAssigneeChoice? = nil,
        labelID: String? = nil
    ) {
        self.state = state
        self.scope = scope
        self.project = project
        self.assignee = assignee
        self.labelID = labelID
    }

    /// Open Tasks, mine: the tab's landing.
    public static let landing = TaskBoardFilter()
    /// Open Tasks assigned to the viewer.
    public static let assignedToMe = TaskBoardFilter(scope: .assignedToMe)

    /// The `task.list` assignee: an explicit "+ Filter" choice wins over the
    /// "Assigned to me" scope.
    public func serverAssignee(viewerUserID: String) -> TaskListAssigneeFilter? {
        switch assignee {
        case .actor(.user(let id))?: .user(id: id)
        case .actor(.agent(let id))?: .agent(id: id)
        case .unassigned?: .unassigned
        case nil: scope == .assignedToMe ? .user(id: viewerUserID) : nil
        }
    }

    public var serverKeyID: String? { project?.keyID }

    /// "Assigned to me" and an explicit assignee answer the same question, so
    /// choosing one drops the other.
    public mutating func choose(scope: TaskBoardScope) {
        self.scope = scope
        if scope == .assignedToMe { assignee = nil }
    }

    public mutating func choose(assignee: TaskBoardAssigneeChoice) {
        self.assignee = assignee
        if scope == .assignedToMe { scope = .everyone }
    }

    /// Whether `task` belongs in the narrowed list.
    public func admits(_ task: TaskRecord, scope context: TaskBoardScopeContext) -> Bool {
        if let labelID, !task.labelIDs.contains(labelID) { return false }
        switch scope {
        case .everyone, .assignedToMe:
            return true
        case .mine:
            return context.isMine(task)
        }
    }

    /// The "+ Filter" choices in force, each drawn as its own clearable chip.
    public var hasExtraFilters: Bool { project != nil || assignee != nil || labelID != nil }
}

/// Who "mine" means: the viewer, and the Captains the viewer started (or that
/// no person started, such as a Server's seeded crew).
public struct TaskBoardScopeContext: Equatable, Sendable {
    public let viewerUserID: String
    public let captainIDs: Set<String>

    public init(viewerUserID: String, captainIDs: Set<String>) {
        self.viewerUserID = viewerUserID
        self.captainIDs = captainIDs
    }

    public func isMine(_ task: TaskRecord) -> Bool {
        if task.assignee == .user(userID: viewerUserID) { return true }
        switch task.createdBy {
        case .user(let id)?: return id == viewerUserID
        case .agent(let id)?: return captainIDs.contains(id)
        case nil: return false
        }
    }
}
