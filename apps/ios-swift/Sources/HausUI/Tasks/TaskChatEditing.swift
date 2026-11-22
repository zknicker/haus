import Foundation
import HausModels

/// Everything the Task chat edits, and the writes that do it. Each write
/// lands the Server's answer; the realtime Task events refresh the rest.
public struct TaskChatEditing {
    public let task: TaskRecord
    public let isFollowed: Bool
    public let captains: [TaskPersonOption]
    public let people: [TaskPersonOption]
    /// `taskLabel.list`, or nil until it has loaded.
    public let labels: [TaskLabel]?
    public let setState: (TaskTargetState) async throws -> Void
    /// Assigns the Task; nil unassigns it.
    public let assign: (TaskActor?) async throws -> Void
    public let setFollow: (Bool) async throws -> Void
    public let update: (TaskUpdatePatch?) async throws -> Void
    public let loadLabels: () async -> Void

    public init(
        task: TaskRecord,
        isFollowed: Bool,
        captains: [TaskPersonOption],
        people: [TaskPersonOption],
        labels: [TaskLabel]?,
        setState: @escaping (TaskTargetState) async throws -> Void,
        assign: @escaping (TaskActor?) async throws -> Void,
        setFollow: @escaping (Bool) async throws -> Void,
        update: @escaping (TaskUpdatePatch?) async throws -> Void,
        loadLabels: @escaping () async -> Void
    ) {
        self.task = task
        self.isFollowed = isFollowed
        self.captains = captains
        self.people = people
        self.labels = labels
        self.setState = setState
        self.assign = assign
        self.setFollow = setFollow
        self.update = update
        self.loadLabels = loadLabels
    }

    var assignee: TaskPersonOption? {
        guard let actor = task.assignee else { return nil }
        return (captains + people).first { $0.actor == actor }
    }
}

/// A row in the Status sheet. The Server keeps four states; "Waiting on you"
/// is read from unread mentions, not set, so the sheet offers only these.
public enum TaskStatusChoice: CaseIterable, Hashable, Sendable {
    case todo
    case inProgress
    case done
    case canceled

    public init?(_ state: TaskState) {
        switch state {
        case .todo: self = .todo
        case .open: self = .inProgress
        case .done: self = .done
        case .canceled: self = .canceled
        case .unknown: return nil
        }
    }

    public var target: TaskTargetState {
        switch self {
        case .todo: .todo
        case .inProgress: .open
        case .done: .done
        case .canceled: .canceled
        }
    }

    public var state: TaskState {
        switch self {
        case .todo: .todo
        case .inProgress: .open
        case .done: .done
        case .canceled: .canceled
        }
    }

    public var title: String { TaskStateLabel.text(state) }
}

/// The `task.update` patches the menu sends, one field each.
public enum TaskEditPatch {
    public static func priority(_ priority: TaskPriority) -> TaskUpdatePatch? {
        TaskUpdatePatch(priority: priority)
    }

    /// Toggles `labelID` on `task`, keeping the rest in their order.
    public static func toggling(label labelID: String, on task: TaskRecord) -> TaskUpdatePatch? {
        let next = task.labelIDs.contains(labelID)
            ? task.labelIDs.filter { $0 != labelID }
            : task.labelIDs + [labelID]
        return TaskUpdatePatch(labelIDs: next)
    }

    /// Sets the due day in the reader's calendar, or clears it.
    public static func due(_ date: Date?, calendar: Calendar = .current) -> TaskUpdatePatch? {
        TaskUpdatePatch(dueOn: date.map { .set(TaskDueDate.dueOn(from: $0, calendar: calendar)) } ?? .clear)
    }
}
