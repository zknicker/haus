import SwiftUI

/// Mail's pattern for regular width (specs/ios-app.md, iPhone Duo): a
/// narrower list pane leads and a wider content pane trails. A side pane
/// takes an equal share beside the content while the list steps aside, so
/// on a device half open like a book the seam lands on the fold.
public struct AdaptiveSplitView<ListPane: View, ContentPane: View, SidePane: View>: View {
    private let showsSide: Bool
    private let list: ListPane
    private let content: ContentPane
    private let side: SidePane

    public init(
        showsSide: Bool,
        @ViewBuilder list: () -> ListPane,
        @ViewBuilder content: () -> ContentPane,
        @ViewBuilder side: () -> SidePane
    ) {
        self.showsSide = showsSide
        self.list = list()
        self.content = content()
        self.side = side()
    }

    public var body: some View {
        NavigationSplitView(columnVisibility: .constant(Self.columnVisibility(showsSide: showsSide))) {
            list
                .navigationSplitViewColumnWidth(min: 270, ideal: 330, max: 360)
                .toolbar(removing: .sidebarToggle)
        } detail: {
            HStack(spacing: 0) {
                content.frame(maxWidth: .infinity)
                if showsSide {
                    Divider().ignoresSafeArea()
                    side.frame(maxWidth: .infinity)
                }
            }
        }
        .navigationSplitViewStyle(.balanced)
    }

    nonisolated static func columnVisibility(showsSide: Bool) -> NavigationSplitViewVisibility {
        showsSide ? .detailOnly : .all
    }
}
