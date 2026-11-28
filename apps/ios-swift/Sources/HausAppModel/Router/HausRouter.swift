import HausModels
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
            if selectedTab != oldValue { unfoldChrome() }
        }
    }
    /// Whether the selected tab root's scrolling has folded the bottom chrome.
    /// The only scroll state views observe: it changes once per fold, while
    /// the tracker below changes on every scroll frame.
    public private(set) var isChromeCollapsed = false
    @ObservationIgnored private var chromeScroll = BottomChromeScroll()
    /// The tab Search returns to when it closes.
    public private(set) var tabBeforeSearch: HausTab = .home
    public private(set) var paths: [HausTab: [HausRoute]] = [:]
    public private(set) var sheet: HausSheet?
    public var tasksView: TaskListView = .mine
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

    /// Stacked, the bar belongs to a tab's root and every pushed screen hides
    /// it; split, it stays beside the selection.
    public var showsTabBar: Bool {
        switch panes(selectedTab) {
        case .split: true
        case let .stack(path): path.isEmpty
        }
    }

    /// Search has its own field, so "Ask anything" sits out there.
    public var showsAskAnything: Bool {
        showsTabBar && selectedTab != .search
    }

    /// Inside a tab, a route pushes onto that tab's stack; in a split tab a
    /// route that `selects` replaces the selection instead. From outside, it
    /// selects its tab and replaces that stack with the route over the root;
    /// a route with no tab of its own stays in the current tab, unless that
    /// is Search. A tab that cannot hold the route opens it as from outside.
    public func open(_ route: HausRoute, from origin: RouteOrigin = .inside) {
        sheet = nil
        reveal = route.revealedMessage
        if origin == .taskCard, case .task = route, Self.canStack(route, on: selectedTab) {
            openBesideConversation(route)
            return
        }
        if origin == .inside, Self.canStack(route, on: selectedTab) {
            guard topRoute != route else { return }
            if layout == .split, Self.selects(route, on: selectedTab) {
                paths[selectedTab] = [route]
                return
            }
            paths[selectedTab, default: []].append(route)
            return
        }
        let staysHere = selectedTab != .search && Self.canStack(route, on: selectedTab)
        let tab = route.homeTab ?? (staysHere ? selectedTab : .home)
        selectedTab = tab
        paths[tab] = [route]
    }

    /// A tab at its root, with nothing over it.
    public func showRoot(_ tab: HausTab) {
        sheet = nil
        selectedTab = tab
        paths[tab] = nil
    }

    public func apply(_ request: RouterRequest, from origin: RouteOrigin) {
        switch request {
        case let .open(route): open(route, from: origin)
        case let .root(tab): showRoot(tab)
        }
    }

    /// Closes Search, back to the tab it was opened from.
    public func closeSearch() {
        guard selectedTab == .search else { return }
        selectedTab = tabBeforeSearch
    }

    /// Feeds a tab root's scrolling into the chrome's fold, while that tab is
    /// the one showing.
    public func scrollRoot(_ tab: HausTab, from old: Double, to new: Double) {
        guard selectedTab == tab else { return }
        chromeScroll.scroll(from: old, to: new)
        if isChromeCollapsed != chromeScroll.isCollapsed {
            isChromeCollapsed = chromeScroll.isCollapsed
        }
    }

    public func unfoldChrome() {
        chromeScroll.expand()
        if isChromeCollapsed { isChromeCollapsed = false }
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
        tasksView = .mine
    }

    /// A Task's card pushes the Task over the conversation it sits in. Split,
    /// a Task already beside that conversation gives way to the new one.
    private func openBesideConversation(_ route: HausRoute) {
        guard topRoute != route else { return }
        if layout == .split, Self.sidePane(in: path(selectedTab)) != nil {
            paths[selectedTab]?.removeLast()
        }
        paths[selectedTab, default: []].append(route)
    }

    /// You holds settings and the Drive it browses; every other tab holds any
    /// route but settings, so Search keeps the conversations its hits open
    /// beside its list.
    nonisolated static func canStack(_ route: HausRoute, on tab: HausTab) -> Bool {
        switch (tab, route) {
        case (.you, .settings), (.you, .driveFile): true
        case (.you, _): false
        case (.home, .settings), (.projects, .settings), (.tasks, .settings), (.search, .settings): false
        case (.home, _), (.projects, _), (.tasks, _), (.search, _): true
        }
    }
}

/// What a push tap or a deep link asks the router for.
public enum RouterRequest: Hashable, Sendable {
    case open(HausRoute)
    /// A tab at its root, for a push the iPhone has no screen for.
    case root(HausTab)
}
