/// How tabs lay out their stacks (specs/ios-app.md, iPhone Duo). Compact
/// width stacks every screen in one column; regular width splits Home,
/// Projects, and Tasks into a list pane and a content pane.
public enum TabLayout: Hashable, Sendable {
    case stack
    case split
}

/// What a tab shows for its stack under the current layout.
public enum TabPanes: Hashable, Sendable {
    /// The tab's root with its whole stack over it.
    case stack([HausRoute])
    /// The list beside the selection, with the rest of the stack over the
    /// selection. A Worker opened straight from its Task sits in a side pane
    /// beside the Task, and the list steps aside.
    case split(selection: HausRoute?, stack: [HausRoute], side: HausRoute?)
}

extension HausTab {
    /// Tabs whose root is a list of places worth opening beside it.
    public var splitsWhenWide: Bool {
        switch self {
        case .home, .projects, .tasks: true
        case .you, .search: false
        }
    }
}

extension HausRouter {
    public func panes(_ tab: HausTab) -> TabPanes {
        let path = path(tab)
        guard isSplit(tab) else { return .stack(path) }
        guard let selection = path.first else { return .split(selection: nil, stack: [], side: nil) }
        let rest = Array(path.dropFirst())
        guard let side = Self.sideRoute(in: path) else { return .split(selection: selection, stack: rest, side: nil) }
        return .split(selection: selection, stack: Array(rest.dropLast()), side: side)
    }

    /// Writes from a split tab's content-pane `NavigationStack`. A changed
    /// stack closes the side pane with it.
    public func setSplitStack(_ stack: [HausRoute], for tab: HausTab) {
        guard case let .split(selection?, current, _) = panes(tab), current != stack else { return }
        setPath([selection] + stack, for: tab)
    }

    func isSplit(_ tab: HausTab) -> Bool {
        layout == .split && tab.splitsWhenWide
    }

    /// A Worker directly over its Task opens beside it rather than over it.
    nonisolated static func sideRoute(in path: [HausRoute]) -> HausRoute? {
        guard path.count >= 2, case .worker = path[path.count - 1], case .task = path[path.count - 2] else {
            return nil
        }
        return path.last
    }
}
