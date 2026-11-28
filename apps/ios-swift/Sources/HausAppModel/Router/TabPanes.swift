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
    /// selection.
    case split(selection: HausRoute?, stack: [HausRoute])
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
        return .split(selection: path.first, stack: Array(path.dropFirst()))
    }

    /// Writes from a split tab's content-pane `NavigationStack`.
    public func setSplitStack(_ stack: [HausRoute], for tab: HausTab) {
        guard case let .split(selection?, current) = panes(tab), current != stack else { return }
        setPath([selection] + stack, for: tab)
    }

    func isSplit(_ tab: HausTab) -> Bool {
        layout == .split && tab.splitsWhenWide
    }
}
