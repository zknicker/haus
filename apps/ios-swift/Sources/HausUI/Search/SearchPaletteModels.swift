import Foundation
import HausModels

/// A Captain the palette can open.
public struct SearchCaptain: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let avatarURL: URL?
    public let isWorking: Bool

    public init(id: String, name: String, avatarURL: URL? = nil, isWorking: Bool = false) {
        self.id = id
        self.name = name
        self.avatarURL = avatarURL
        self.isWorking = isWorking
    }
}

/// A Server member the palette can open a DM with.
public struct SearchPerson: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let handle: String?
    public let avatarURL: URL?

    public init(id: String, name: String, handle: String? = nil, avatarURL: URL? = nil) {
        self.id = id
        self.name = name
        self.handle = handle
        self.avatarURL = avatarURL
    }
}

/// A Task the viewer may read, from the Server's authorized Task lists.
public struct SearchTask: Identifiable, Hashable, Sendable {
    public let id: String
    public let key: String
    public let title: String
    public let state: TaskState
    public let captain: SearchCaptain?
    public let updatedAt: Date

    public init(id: String, key: String, title: String, state: TaskState, captain: SearchCaptain?, updatedAt: Date) {
        self.id = id
        self.key = key
        self.title = title
        self.state = state
        self.captain = captain
        self.updatedAt = updatedAt
    }
}

/// What the palette searches when a scope chip is on. `chat.search` returns
/// messages only; every other scope filters a list the Server already authorized.
public enum SearchScope: String, CaseIterable, Hashable, Sendable {
    case messages
    case tasks
    case captains
    case projects
    case people

    public var title: String {
        switch self {
        case .messages: "Messages"
        case .tasks: "Tasks"
        case .captains: "Captains"
        case .projects: "Projects"
        case .people: "People"
        }
    }
}

/// The lists the palette searches locally. Nil lists have not loaded.
public struct SearchPaletteContent: Sendable {
    public let captains: [SearchCaptain]
    public let people: [SearchPerson]
    public let tasks: [SearchTask]?

    public init(captains: [SearchCaptain], people: [SearchPerson], tasks: [SearchTask]?) {
        self.captains = captains
        self.people = people
        self.tasks = tasks
    }

    public static let empty = SearchPaletteContent(captains: [], people: [], tasks: nil)
}

/// Where the palette's rows and actions lead, owned by the App's router.
public struct SearchPaletteActions {
    public let onSelectCaptain: (String) -> Void
    public let onSelectTask: (String) -> Void
    /// A person without a DM opens the Server's People.
    public let onOpenPeople: () -> Void
    public let onNewTask: () -> Void
    public let onNewProject: () -> Void
    public let onGoToTasks: () -> Void
    public let onGoToSettings: () -> Void
    public let onClose: () -> Void
    /// Reads the Task lists the palette searches, when the tab appears.
    public let onAppear: () async -> Void

    public init(
        onSelectCaptain: @escaping (String) -> Void,
        onSelectTask: @escaping (String) -> Void,
        onOpenPeople: @escaping () -> Void,
        onNewTask: @escaping () -> Void,
        onNewProject: @escaping () -> Void,
        onGoToTasks: @escaping () -> Void,
        onGoToSettings: @escaping () -> Void,
        onClose: @escaping () -> Void,
        onAppear: @escaping () async -> Void
    ) {
        self.onSelectCaptain = onSelectCaptain
        self.onSelectTask = onSelectTask
        self.onOpenPeople = onOpenPeople
        self.onNewTask = onNewTask
        self.onNewProject = onNewProject
        self.onGoToTasks = onGoToTasks
        self.onGoToSettings = onGoToSettings
        self.onClose = onClose
        self.onAppear = onAppear
    }

    public static var preview: SearchPaletteActions {
        SearchPaletteActions(
            onSelectCaptain: { _ in }, onSelectTask: { _ in }, onOpenPeople: {}, onNewTask: {}, onNewProject: {},
            onGoToTasks: {}, onGoToSettings: {}, onClose: {}, onAppear: {}
        )
    }
}

/// One palette action with its glyph.
enum SearchPaletteAction: CaseIterable, Hashable, Sendable {
    case newTask
    case newProject
    case goToTasks
    case goToSettings

    var title: String {
        switch self {
        case .newTask: "New task"
        case .newProject: "New project"
        case .goToTasks: "Go to Tasks"
        case .goToSettings: "Go to Settings"
        }
    }

    var systemImage: String {
        switch self {
        case .newTask: "pencil"
        case .newProject: "number"
        case .goToTasks: "list.bullet"
        case .goToSettings: "gearshape"
        }
    }
}
