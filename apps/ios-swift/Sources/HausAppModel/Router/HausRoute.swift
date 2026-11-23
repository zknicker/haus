import HausModels

/// The five root tabs, in tab-bar order (specs/ios-app.md, Shell).
public enum HausTab: String, CaseIterable, Hashable, Sendable {
    case home
    case projects
    case tasks
    case you
    case search
}

/// A place the Work view lists Workers, Tasks, PRs, and Files for.
public enum HausWorkPlace: Hashable, Sendable {
    case chat(String)
    case task(String)
}

/// A conversation a route shows, before the App resolves it to a Chat id.
public enum HausConversation: Hashable, Sendable {
    case chat(String)
    case captain(String)
    case task(String)
}

extension HausConversation {
    /// The Chat id behind the conversation, once the App can resolve it.
    public func chatID(captainChat: (String) -> String?, taskChat: (String) -> String?) -> String? {
        switch self {
        case let .chat(chatID): chatID
        case let .captain(agentID): captainChat(agentID)
        case let .task(taskID): taskChat(taskID)
        }
    }
}

/// Every screen a tab's stack can hold (specs/ios-app.md, Routes).
public enum HausRoute: Hashable, Sendable {
    case captainDM(agentID: String)
    case channel(chatID: String, messageID: String? = nil)
    case dm(chatID: String, messageID: String? = nil)
    case task(taskID: String, messageID: String? = nil)
    case worker(workerID: String)
    case pullRequest(PullRequestReading)
    case work(HausWorkPlace)
    case driveFile(path: String)
    case settings(SettingsRoute)
    /// A Project's keys, repos, and default Worker place.
    case projectSettings(projectID: String)

    /// The tab an outside open lands in. Nil opens in the current tab.
    public var homeTab: HausTab? {
        switch self {
        case .captainDM, .dm: .home
        case .channel, .projectSettings: .projects
        case .task: .tasks
        case .settings: .you
        case .worker, .pullRequest, .work, .driveFile: nil
        }
    }

    /// Chat routes give the bottom edge to the composer: no tab bar, no accessory.
    public var isChat: Bool {
        switch self {
        case .captainDM, .channel, .dm, .task, .worker: true
        case .pullRequest, .work, .driveFile, .settings, .projectSettings: false
        }
    }

    /// The conversation on screen, the only one that may mark read or
    /// suppress a push.
    public var conversation: HausConversation? {
        switch self {
        case let .captainDM(agentID): .captain(agentID)
        case let .channel(chatID, _), let .dm(chatID, _): .chat(chatID)
        case let .task(taskID, _): .task(taskID)
        case .worker, .pullRequest, .work, .driveFile, .settings, .projectSettings: nil
        }
    }

    /// The message the route reveals and highlights on arrival.
    public var revealedMessage: MessageReveal? {
        switch self {
        case let .channel(chatID, messageID?), let .dm(chatID, messageID?):
            MessageReveal(conversation: .chat(chatID), messageID: messageID)
        case let .task(taskID, messageID?):
            MessageReveal(conversation: .task(taskID), messageID: messageID)
        default:
            nil
        }
    }
}

/// A message to reveal once its conversation is on screen.
public struct MessageReveal: Hashable, Sendable {
    public let conversation: HausConversation
    public let messageID: String

    public init(conversation: HausConversation, messageID: String) {
        self.conversation = conversation
        self.messageID = messageID
    }
}

/// What the Tasks tab lists.
public enum TasksTabFilter: Hashable, Sendable {
    /// Followed Tasks with unread messages.
    case following
    case assignedToMe
}

/// The one sheet the router may present.
public enum HausSheet: Hashable, Identifiable, Sendable {
    case askAnything
    case newProject
    case newCaptain
    case archivedProjects
    case chatDetails(HausConversation)
    case chatSearch(chatID: String?)

    public var id: Self { self }
}

/// Where an open comes from: a tap inside a tab, or a push or deep link.
public enum RouteOrigin: Sendable {
    case inside
    case outside
}
