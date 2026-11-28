import HausAppModel
import HausModels
import HausUI
import SwiftUI

/// Each tab at compact width as its stack, and at regular width as its list
/// column beside the selection (specs/ios-app.md, iPhone Duo).
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
        case let .split(selection, _) where tab == .search:
            AdaptiveSplitView(column: listColumn) {
                root().foldsBottomChrome(tab, router: router)
            } content: {
                splitContent(tab, selection: selection)
            }
        case let .split(selection, _):
            AdaptiveSplitView(column: listColumn) {
                root().foldsBottomChrome(tab, router: router)
            } rail: {
                rail(tab)
            } content: {
                splitContent(tab, selection: selection)
            }
        }
    }

    private func splitContent(_ tab: HausTab, selection: HausRoute?) -> some View {
        NavigationStack(path: navigationPath({ splitStack(tab) }) { router.setSplitStack($0, for: tab) }) {
            Group {
                if let selection {
                    routeDestination(selection).environment(\.chatHeaderShowsBack, false)
                } else {
                    Color.clear
                }
            }
            .navigationDestination(for: HausRoute.self) { routeDestination($0) }
        }
        .id(selection)
    }

    private func splitStack(_ tab: HausTab) -> [HausRoute] {
        guard case let .split(_, stack) = router.panes(tab) else { return [] }
        return stack
    }
}
