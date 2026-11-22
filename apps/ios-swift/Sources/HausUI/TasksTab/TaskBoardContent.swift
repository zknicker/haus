import Foundation
import HausModels

/// A Project a Task can be filed in or filtered by.
public struct TaskProjectOption: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    /// The Project's Task key id, which `task.list` filters by.
    public let keyID: String
    /// Captains homed in the Project, offered first when starting a Task there.
    public let homeAgentIDs: [String]

    public init(id: String, name: String, keyID: String, homeAgentIDs: [String] = []) {
        self.id = id
        self.name = name
        self.keyID = keyID
        self.homeAgentIDs = homeAgentIDs
    }
}

/// A Captain or a person a Task can be assigned to.
public struct TaskPersonOption: Identifiable, Hashable, Sendable {
    public let actor: TaskActor
    public let name: String
    public let avatarURL: URL?

    public init(actor: TaskActor, name: String, avatarURL: URL?) {
        self.actor = actor
        self.name = name
        self.avatarURL = avatarURL
    }

    public var id: TaskActor { actor }
    public var isCaptain: Bool { actor.agentID != nil }
}

/// What the Tasks tab draws from. `tasks` is nil until the list for the
/// current filter has loaded, so the tab stays blank rather than empty.
public struct TaskBoardContent: Sendable {
    public let tasks: [TaskRecord]?
    public let scope: TaskBoardScopeContext
    public let captains: [TaskPersonOption]
    public let people: [TaskPersonOption]
    public let projects: [TaskProjectOption]
    public let labels: [TaskLabel]
    /// Unfinished Tasks whose unread messages name the viewer.
    public let waitingOnYouTaskIDs: Set<String>

    public init(
        tasks: [TaskRecord]?,
        scope: TaskBoardScopeContext,
        captains: [TaskPersonOption],
        people: [TaskPersonOption],
        projects: [TaskProjectOption],
        labels: [TaskLabel],
        waitingOnYouTaskIDs: Set<String>
    ) {
        self.tasks = tasks
        self.scope = scope
        self.captains = captains
        self.people = people
        self.projects = projects
        self.labels = labels
        self.waitingOnYouTaskIDs = waitingOnYouTaskIDs
    }

    func person(_ actor: TaskActor?) -> TaskPersonOption? {
        guard let actor else { return nil }
        return (actor.agentID != nil ? captains : people).first { $0.actor == actor }
    }

    func project(id: String?) -> TaskProjectOption? {
        guard let id else { return nil }
        return projects.first { $0.id == id }
    }
}

/// How the tab orders rows inside each state section.
public enum TaskBoardOrdering: String, CaseIterable, Hashable, Sendable {
    case newest
    case priority

    public var title: String {
        switch self {
        case .newest: "Newest"
        case .priority: "Priority"
        }
    }
}
