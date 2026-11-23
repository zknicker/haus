import Observation

/// The one owner of navigation (specs/ios-app.md, Router): the selected tab,
/// a route stack per tab, and at most one sheet. Every open goes through
/// `open(_:from:)`.
@MainActor
@Observable
public final class HausRouter {
    public var selectedTab: HausTab = .home {
        didSet {
            if selectedTab == .search, oldValue != .search { tabBeforeSearch = oldValue }
        }
    }
    /// The tab Search returns to when it closes.
    public private(set) var tabBeforeSearch: HausTab = .home
    public private(set) var paths: [HausTab: [HausRoute]] = [:]
    public private(set) var sheet: HausSheet?
    public var tasksFilter: TasksTabFilter = .following
    /// The message the next screen for its conversation reveals.
    public private(set) var reveal: MessageReveal?
    /// The Server the stacks belong to. Another Server resets them.
    public private(set) var serverID: String?
    /// Follows the horizontal size class. A layout change keeps every
    /// stack, so folding and unfolding keep what is open.
    public var layout: TabLayout = .stack

    public init() {}

    public func path(_ tab: HausTab) -> [HausRoute] {
        paths[tab] ?? []
    }

    /// Writes from a tab's `NavigationStack`: back, interactive pop, or a
    /// link push.
    public func setPath(_ path: [HausRoute], for tab: HausTab) {
        guard self.path(tab) != path else { return }
        paths[tab] = path.isEmpty ? nil : path
    }

    public var topRoute: HausRoute? {
        path(selectedTab).last
    }

    /// The conversation the reader is looking at: the selected tab's top
    /// route, or, split, the content pane's top beside a side pane. Never a
    /// chat mounted lower in a stack or in another tab.
    public var visibleConversation: HausConversation? {
        if case let .split(selection, stack, _?) = panes(selectedTab) {
            return (stack.last ?? selection)?.conversation
        }
        return topRoute?.conversation
    }

    /// Stacked, a conversation owns the bottom edge; split, the bar stays
    /// until a side pane needs the width.
    public var showsTabBar: Bool {
        switch panes(selectedTab) {
        case let .split(_, _, side): side == nil
        case let .stack(path): !(path.last?.isChat ?? false)
        }
    }

    /// Search has its own field, so "Ask anything" sits out there.
    public var showsAskAnything: Bool {
        showsTabBar && selectedTab != .search
    }

    /// Inside a tab, a route pushes onto that tab's stack; in a split tab a
    /// conversation replaces the selection instead. From outside, it selects
    /// its tab and replaces that stack with the route over the root. A tab
    /// that cannot hold the route opens it as from outside.
    public func open(_ route: HausRoute, from origin: RouteOrigin = .inside) {
        sheet = nil
        reveal = route.revealedMessage
        if origin == .inside, Self.canStack(route, on: selectedTab) {
            guard topRoute != route else { return }
            if isSplit(selectedTab), route.conversation != nil {
                paths[selectedTab] = [route]
                return
            }
            paths[selectedTab, default: []].append(route)
            return
        }
        let tab = route.homeTab ?? (Self.canStack(route, on: selectedTab) ? selectedTab : .home)
        selectedTab = tab
        paths[tab] = [route]
    }

    /// The Tasks tab at its root, showing `filter`.
    public func showTasks(_ filter: TasksTabFilter) {
        sheet = nil
        selectedTab = .tasks
        paths[.tasks] = nil
        tasksFilter = filter
    }

    public func apply(_ request: RouterRequest, from origin: RouteOrigin) {
        switch request {
        case let .open(route): open(route, from: origin)
        case let .tasks(filter): showTasks(filter)
        }
    }

    /// Closes Search, back to the tab it was opened from.
    public func closeSearch() {
        guard selectedTab == .search else { return }
        selectedTab = tabBeforeSearch
    }

    public func pop() {
        guard paths[selectedTab]?.isEmpty == false else { return }
        paths[selectedTab]?.removeLast()
        if paths[selectedTab]?.isEmpty == true { paths[selectedTab] = nil }
    }

    public func present(_ sheet: HausSheet) {
        self.sheet = sheet
    }

    public func dismissSheet() {
        sheet = nil
    }

    /// The message to reveal in `conversation`, while it is still pending.
    public func revealedMessageID(in conversation: HausConversation) -> String? {
        reveal?.conversation == conversation ? reveal?.messageID : nil
    }

    public func finishReveal() {
        reveal = nil
    }

    /// Adopts the active Server. Switching from one Server to another resets
    /// every tab's stack to its root and closes the sheet.
    public func adopt(serverID: String?) {
        guard self.serverID != serverID else { return }
        let previous = self.serverID
        self.serverID = serverID
        guard previous != nil else { return }
        paths = [:]
        sheet = nil
        reveal = nil
        tasksFilter = .following
    }

    /// You holds settings and the Drive it browses; Search hosts its own
    /// palette and opens results in their own tabs; every other tab holds any
    /// route but settings.
    nonisolated static func canStack(_ route: HausRoute, on tab: HausTab) -> Bool {
        switch (tab, route) {
        case (.you, .settings), (.you, .driveFile): true
        case (.you, _), (.search, _): false
        case (.home, .settings), (.projects, .settings), (.tasks, .settings): false
        case (.home, _), (.projects, _), (.tasks, _): true
        }
    }
}

/// What a push tap or a deep link asks the router for.
public enum RouterRequest: Hashable, Sendable {
    case open(HausRoute)
    case tasks(TasksTabFilter)
}
