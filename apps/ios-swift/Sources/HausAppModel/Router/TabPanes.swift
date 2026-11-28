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
    /// selection. A Task directly over a conversation sits beside it in the
    /// side pane, and the list steps aside.
    case split(selection: HausRoute?, stack: [HausRoute], side: HausRoute? = nil)
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
        let selection = path.first ?? tab.emptySelection
        guard let side = Self.sidePane(in: path) else {
            return .split(selection: selection, stack: Array(path.dropFirst()))
        }
        return .split(selection: selection, stack: Array(path.dropFirst().dropLast()), side: side)
    }

    /// The conversations the reader is looking at: the selected tab's top
    /// route, and beside a Task the conversation under it too. Never a chat
    /// mounted lower in a stack or in another tab.
    public var visibleConversations: Set<HausConversation> {
        let path = path(selectedTab)
        var shown = Set([path.last?.conversation].compactMap(\.self))
        if layout == .split, Self.sidePane(in: path) != nil, let beneath = path.dropLast().last?.conversation {
            shown.insert(beneath)
        }
        return shown
    }

    /// The Task a conversation's composer steers: the side pane's, for the
    /// conversation right under it. Folded there is no side pane, so the same
    /// conversation writes its own draft, and unfolding brings the chip back.
    public func besideTask(of route: HausRoute, in tab: HausTab) -> String? {
        guard case .split(_, _, .task(let taskID, _)?) = panes(tab), path(tab).dropLast().last == route else { return nil }
        return taskID
    }

    /// Writes from a compact tab's `NavigationStack`. Folding and unfolding
    /// swap a tab's stack for its split and back, and a stack being torn down
    /// once the layout has moved on writes nothing: only the stack on screen
    /// speaks for the tab. SwiftUI pops the compact stack during the scene's
    /// move to the outer display when a Task sat beside its conversation
    /// (`NavigationColumnState.pop`, run in the window's rotation), before
    /// the stack's top screen has appeared. This is the bounded workaround: a
    /// write that drops several routes before then is refused, once per fold,
    /// and the stack redraws from the router's path; Back pops one screen and
    /// is always taken. Remove it once the `pose` fault stops firing on a
    /// newer iOS.
    /// Returns whether the write was taken.
    @discardableResult
    public func setStackPath(_ path: [HausRoute], for tab: HausTab) -> Bool {
        guard layout == .stack else { return false }
        if unseenStacks.contains(tab), self.path(tab).count - path.count > 1 {
            if restoredStacks.insert(tab).inserted { stackRevision += 1 }
            return false
        }
        write(path, for: tab)
        return true
    }

    /// The top screen of a tab's stack appeared, so the reader can see what
    /// a write would take away.
    public func stackAppeared(_ tab: HausTab) {
        unseenStacks.remove(tab)
    }

    /// Writes from a split tab's content-pane `NavigationStack`. A changed
    /// stack closes the side pane with it: the Task belonged to the
    /// conversation that was on top.
    public func setSplitStack(_ stack: [HausRoute], for tab: HausTab) {
        guard case let .split(selection?, current, _) = panes(tab), current != stack else { return }
        setPath([selection] + stack, for: tab)
    }

    /// Closes the Task beside its conversation, back to the conversation.
    public func closeSidePane(_ tab: HausTab) {
        guard case .split(_, _, _?) = panes(tab) else { return }
        setPath(Array(path(tab).dropLast()), for: tab)
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

    /// A Task directly over a Captain chat, a DM or a Channel sits beside it.
    nonisolated static func sidePane(in path: [HausRoute]) -> HausRoute? {
        guard path.count >= 2, case .task = path[path.count - 1] else { return nil }
        switch path[path.count - 2] {
        case .captain, .dm, .channel: return path.last
        case .task, .pullRequest, .work, .driveFile, .settings, .projectSettings: return nil
        }
    }
}
