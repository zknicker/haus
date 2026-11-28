import SwiftUI

/// Mail's pattern for regular width (specs/ios-app.md, iPhone Duo): a
/// narrower list pane leads and a wider content pane trails.
public struct AdaptiveSplitView<ListPane: View, ContentPane: View>: View {
    private let list: ListPane
    private let content: ContentPane

    public init(@ViewBuilder list: () -> ListPane, @ViewBuilder content: () -> ContentPane) {
        self.list = list()
        self.content = content()
    }

    public var body: some View {
        NavigationSplitView(columnVisibility: .constant(.all)) {
            list
                .navigationSplitViewColumnWidth(min: 270, ideal: 330, max: 360)
                .toolbar(removing: .sidebarToggle)
        } detail: {
            content.frame(maxWidth: .infinity)
        }
        .navigationSplitViewStyle(.balanced)
    }
}
