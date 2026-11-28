import HausModels
import SwiftUI

/// Mail's pattern for regular width (specs/ios-app.md, iPhone Duo): a
/// narrower list column leads and a wider content column trails. The list
/// column is the full list, the tab's 76 pt rail, or hidden (`ListColumn`).
/// The system's column holds the full list and draws the sidebar button, but
/// it never draws narrower than about 280 pt, so the rail leads the whole
/// split, whose column is hidden meanwhile. Outside the split, the rail stays
/// clear of the detail column's bars. A 12 pt handle on the full list's or the
/// rail's trailing edge drags between the states.
public struct AdaptiveSplitView<ListPane: View, RailPane: View, ContentPane: View>: View {
    @Binding private var column: ListColumn
    private let hasRail: Bool
    private let list: ListPane
    private let rail: RailPane
    private let content: ContentPane

    @State private var listWidth = ListColumnLayout.fullIdealWidth

    public init(
        column: Binding<ListColumn>,
        @ViewBuilder list: () -> ListPane,
        @ViewBuilder rail: () -> RailPane,
        @ViewBuilder content: () -> ContentPane
    ) {
        _column = column
        hasRail = true
        self.list = list()
        self.rail = rail()
        self.content = content()
    }

    public var body: some View {
        HStack(spacing: 0) {
            if column.shown(hasRail: hasRail) == .rail {
                rail
                    .overlay(alignment: .trailing) {
                        ListColumnHandle(width: ListColumnLayout.railWidth, hasRail: hasRail) { column = $0 }
                    }
                    .overlay(alignment: .trailing) {
                        Rectangle().fill(HausPlatformColor.hairline).frame(width: 1).ignoresSafeArea()
                    }
                    .transition(.move(edge: .leading))
            }
            split
        }
    }

    private var split: some View {
        NavigationSplitView(columnVisibility: visibility) {
            list
                .frame(maxWidth: .infinity)
                .environment(\.isListColumn, true)
                .toolbar(removing: sidebarToggleRemoved)
                .onGeometryChange(for: CGFloat.self, of: \.size.width) { listWidth = $0 }
                .overlay(alignment: .trailing) {
                    ListColumnHandle(width: listWidth, hasRail: hasRail) { column = $0 }
                }
                .navigationSplitViewColumnWidth(
                    min: ListColumnLayout.fullMinimumWidth,
                    ideal: ListColumnLayout.fullIdealWidth,
                    max: ListColumnLayout.fullMaximumWidth
                )
        } detail: {
            content.frame(maxWidth: .infinity)
        }
        .navigationSplitViewStyle(.balanced)
        .toolbar(removing: sidebarToggleRemoved)
    }

    /// The rail has its own button for the full list, so the system's sidebar
    /// button stands only beside the full list and over a hidden column.
    private var sidebarToggleRemoved: ToolbarDefaultItemKind? {
        column.shown(hasRail: hasRail) == .rail ? .sidebarToggle : nil
    }

    private var visibility: Binding<NavigationSplitViewVisibility> {
        Binding(
            get: { column.shown(hasRail: hasRail).visibility },
            set: { visibility in
                let shown = column.shown(hasRail: hasRail).showing(visibility)
                if shown != column { column = shown }
            }
        )
    }
}

extension AdaptiveSplitView where RailPane == EmptyView {
    /// A split with no rail: its list column is full or hidden.
    public init(
        column: Binding<ListColumn>,
        @ViewBuilder list: () -> ListPane,
        @ViewBuilder content: () -> ContentPane
    ) {
        _column = column
        hasRail = false
        self.list = list()
        rail = EmptyView()
        self.content = content()
    }
}

extension EnvironmentValues {
    /// True inside a split tab's list column, whose screen titles lead the
    /// column under stock bars.
    @Entry public var isListColumn = false
}
