/// How tabs lay out their stacks (specs/ios-app.md, iPhone Duo). Compact
/// width stacks every screen in one column; regular width splits every tab
/// into a list pane and a content pane.
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
    /// What the content pane shows beside the list before anything is
    /// selected. You's settings list opens on General.
    public var emptySelection: HausRoute? {
        switch self {
        case .you: .settings(.general)
        case .home, .projects, .tasks, .search: nil
        }
    }
}

extension HausRouter {
    public func panes(_ tab: HausTab) -> TabPanes {
        let path = path(tab)
        guard layout == .split else { return .stack(path) }
        return .split(selection: path.first ?? tab.emptySelection, stack: Array(path.dropFirst()))
    }

    /// Writes from a split tab's content-pane `NavigationStack`.
    public func setSplitStack(_ stack: [HausRoute], for tab: HausTab) {
        guard case let .split(selection?, current) = panes(tab), current != stack else { return }
        setPath([selection] + stack, for: tab)
    }

    /// What replaces a split tab's selection instead of stacking over it: a
    /// conversation, or on You a row of its list (a settings screen or
    /// Drive's root).
    nonisolated static func selects(_ route: HausRoute, on tab: HausTab) -> Bool {
        switch (tab, route) {
        case (.you, .settings), (.you, .driveFile(path: "")): true
        case (.you, _): false
        case (.home, _), (.projects, _), (.tasks, _), (.search, _): route.conversation != nil
        }
    }
}
