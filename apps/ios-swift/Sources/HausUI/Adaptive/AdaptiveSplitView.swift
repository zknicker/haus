import HausModels
import SwiftUI

/// Mail's pattern for regular width (specs/ios-app.md, iPhone Duo): a
/// narrower list column leads and a wider content column trails. The list
/// column is the full list, the tab's 76 pt rail, or hidden (`ListColumn`).
/// The system's column holds the full list and draws the sidebar button, but
/// it never draws narrower than about 280 pt, so the rail leads the whole
/// split, whose column is hidden meanwhile. Outside the split, the rail stays
/// clear of the detail column's bars. A 12 pt handle on the full list's or the
/// rail's trailing edge drags between the states. Beside a Task the column
/// steps aside to the rail until the Task closes (`TaskModeColumn`). Half
/// open like a book with no Task, the full list reaches the fold.
public struct AdaptiveSplitView<ListPane: View, RailPane: View, ContentPane: View>: View {
    @Binding private var column: ListColumn
    private let besideTask: Bool
    private let hasRail: Bool
    private let list: ListPane
    private let rail: RailPane
    private let content: ContentPane

    @State private var listWidth = ListColumnLayout.fullIdealWidth
    @State private var taskMode = TaskModeColumn()
    @State private var columnWidth = ListColumnWidth()
    @State private var refusedVisibility = 0
    @State private var besideActiveFold = false

    public init(
        column: Binding<ListColumn>,
        besideTask: Bool = false,
        @ViewBuilder list: () -> ListPane,
        @ViewBuilder rail: () -> RailPane,
        @ViewBuilder content: () -> ContentPane
    ) {
        _column = column
        self.besideTask = besideTask
        hasRail = true
        self.list = list()
        self.rail = rail()
        self.content = content()
    }

    public var body: some View {
        FoldReader { size, fold in
            HStack(spacing: 0) {
                if shown == .rail {
                    rail
                        .environment(\.revealListColumn) { choose(.full) }
                        .overlay(alignment: .trailing) {
                            ListColumnHandle(width: ListColumnLayout.railWidth, hasRail: hasRail) { choose($0) }
                        }
                        .overlay(alignment: .trailing) {
                            Rectangle().fill(HausPlatformColor.hairline).frame(width: 1).ignoresSafeArea()
                        }
                        .transition(.move(edge: .leading))
                }
                split
            }
            .onChange(of: ListColumnLayout.foldedWidth(fold: fold, width: size.width, besideTask: besideTask), initial: true) {
                columnWidth.fold(to: $1)
            }
            .onChange(of: ListColumnLayout.pinsTaskModeAside(fold: fold, width: size.width, besideTask: besideTask), initial: true) {
                besideActiveFold = $1
            }
        }
        .animation(.smooth(duration: 0.3), value: besideTask)
        .animation(.smooth(duration: 0.3), value: besideActiveFold)
        .animation(.smooth(duration: 0.3), value: columnWidth.folded)
        .onChange(of: besideTask) { _, isOpen in
            if !isOpen { taskMode.taskClosed() }
        }
    }

    /// Half open, the full list reaches the fold (`ListColumnLayout.foldedWidth`)
    /// and keeps its rows clear of it; the handle steps away until the Duo opens.
    /// Haus alone moves the column, so the system's sidebar button is gone and
    /// a hidden column's detail shows Haus's own Show list (`\.revealListColumn`).
    private var split: some View {
        NavigationSplitView(columnVisibility: visibility) {
            list
                .padding(.trailing, isFolded ? Fold.clearance : 0)
                .frame(maxWidth: .infinity)
                .environment(\.isListColumn, true)
                .toolbar(removing: .sidebarToggle)
                .onGeometryChange(for: CGFloat.self, of: \.size.width) {
                    listWidth = $0
                    columnWidth.measured($0)
                }
                .overlay(alignment: .trailing) {
                    if !isFolded {
                        ListColumnHandle(width: listWidth, hasRail: hasRail) { choose($0) }
                    }
                }
                .navigationSplitViewColumnWidth(
                    min: columnWidth.fixed ?? ListColumnLayout.fullMinimumWidth,
                    ideal: columnWidth.fixed ?? ListColumnLayout.fullIdealWidth,
                    max: columnWidth.fixed ?? ListColumnLayout.fullMaximumWidth
                )
        } detail: {
            content
                .frame(maxWidth: .infinity)
                .environment(\.revealListColumn, shown == .hidden ? { choose(.full) } : nil)
                .environment(\.listColumnIsFull, shown == .full)
        }
        .navigationSplitViewStyle(.balanced)
        .toolbar(removing: .sidebarToggle)
        .onChange(of: refusedVisibility) {}
    }

    private var isFolded: Bool {
        columnWidth.folded != nil
    }

    private var shown: ListColumn {
        isFolded ? .full : taskMode.shown(column, besideTask: besideTask, hasRail: hasRail, besideActiveFold: besideActiveFold)
    }

    private func choose(_ next: ListColumn) {
        var mode = taskMode
        if let kept = mode.choose(next, besideTask: besideTask) {
            column = kept
            return
        }
        withAnimation(.smooth(duration: 0.3)) { taskMode = mode }
    }

    /// The system writes the column's visibility on its own, as when the Duo
    /// turns to portrait and it hides the list. That write is refused and the
    /// split redrawn, so the column stays where the reader put it and the
    /// refusal never reaches the stored `ListColumn`.
    private var visibility: Binding<NavigationSplitViewVisibility> {
        Binding(
            get: { shown.visibility },
            set: { if $0 != shown.visibility { refusedVisibility += 1 } }
        )
    }
}

extension AdaptiveSplitView where RailPane == EmptyView {
    /// A split with no rail: its list column is full or hidden.
    public init(
        column: Binding<ListColumn>,
        besideTask: Bool = false,
        @ViewBuilder list: () -> ListPane,
        @ViewBuilder content: () -> ContentPane
    ) {
        _column = column
        self.besideTask = besideTask
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
    /// True in a split's detail while the full list leads it, so Task mode's
    /// panes split what is left instead of meeting at a fold they no longer span.
    @Entry public var listColumnIsFull = false
}
