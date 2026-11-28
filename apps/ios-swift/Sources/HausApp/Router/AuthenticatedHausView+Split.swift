import HausAppModel
import HausModels
import HausUI
import SwiftUI

/// Each tab at compact width as its stack, and at regular width as its list
/// column beside the selection (specs/ios-app.md, iPhone Duo). A Task opened
/// from its card sits beside its conversation, and the list steps aside.
extension AuthenticatedHausView {
    func adaptiveStack<Root: View>(_ tab: HausTab, @ViewBuilder root: () -> Root) -> some View {
        adaptiveStack(tab, root: root, stacked: { stack(tab, root: root) })
    }

    /// Compact width keeps the tab's stack. Regular width shows its list,
    /// or the rail in its place, beside the selection. The pane's stack holds
    /// settings screens as themselves, so the settings screen it starts from
    /// draws the ones it pushes.
    @ViewBuilder
    func adaptiveStack<Root: View, Stacked: View>(
        _ tab: HausTab,
        @ViewBuilder root: () -> Root,
        @ViewBuilder stacked: () -> Stacked
    ) -> some View {
        switch router.panes(tab) {
        case .stack:
            stacked()
        case let .split(selection, _, side) where tab == .search:
            AdaptiveSplitView(column: listColumn, besideTask: side != nil) {
                root().foldsBottomChrome(tab, router: router)
            } content: {
                splitContent(tab, selection: selection, side: side)
            }
        case let .split(selection, _, side):
            AdaptiveSplitView(column: listColumn, besideTask: side != nil) {
                root().foldsBottomChrome(tab, router: router)
            } rail: {
                rail(tab)
            } content: {
                splitContent(tab, selection: selection, side: side)
            }
        }
    }

    private func splitContent(_ tab: HausTab, selection: HausRoute?, side: HausRoute?) -> some View {
        let sideTaskID = side.flatMap(\.taskID)
        let beneath = side.flatMap { _ in router.path(tab).dropLast().last }
        return TaskModeSplit(isOpen: sideTaskID != nil) {
            NavigationStack(path: navigationPath({ splitStack(tab) }) { router.setSplitStack($0, for: tab) }) {
                Group {
                    if let selection {
                        conversationScreen(selection, beneath: beneath, sideTaskID: sideTaskID)
                            .environment(\.chatHeaderShowsBack, false)
                    } else {
                        Color.clear
                    }
                }
                .navigationDestination(for: HausRoute.self) {
                    conversationScreen($0, beneath: beneath, sideTaskID: sideTaskID)
                }
            }
            .id(selection)
        } task: {
            if let sideTaskID {
                taskPane(sideTaskID, tab: tab)
            }
        }
    }

    /// The conversation directly under the side pane carries the Task's
    /// chip in its composer and the Task's controls in its bar. Every screen
    /// keeps the same shape, so opening the Task never remounts it.
    private func conversationScreen(_ route: HausRoute, beneath: HausRoute?, sideTaskID: String?) -> some View {
        let besideTaskID = route == beneath ? sideTaskID : nil
        return routeDestination(route, besideTaskID: besideTaskID)
            .taskModeChrome(besideTaskID.map(taskModeChrome))
    }

    private func splitStack(_ tab: HausTab) -> [HausRoute] {
        guard case let .split(_, stack, _) = router.panes(tab) else { return [] }
        return stack
    }
}

extension HausRoute {
    var taskID: String? {
        if case let .task(taskID, _) = self { taskID } else { nil }
    }
}
