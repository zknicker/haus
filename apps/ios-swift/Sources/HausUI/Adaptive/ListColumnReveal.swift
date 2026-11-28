import SwiftUI

extension EnvironmentValues {
    /// Brings back a split's full list column, through the same choice a drag
    /// makes, so beside a Task it moves only that Task's column. Set inside
    /// its detail while the column is hidden, and on its rail.
    @Entry public var revealListColumn: (() -> Void)? = nil
}

extension View {
    /// The detail's Show list while its list column is hidden. Haus draws it:
    /// the system's sidebar button sat in the detail column's own bar, which
    /// the conversation's stack covers, so with bars horizontal (inner
    /// portrait) a hidden list could not come back.
    public func showListButton() -> some View {
        modifier(ShowListButton())
    }
}

private struct ShowListButton: ViewModifier {
    @Environment(\.revealListColumn) private var reveal

    func body(content: Content) -> some View {
        content.toolbar {
            if let reveal {
                ToolbarItem(placement: .navigation) {
                    Button("Show list", systemImage: "sidebar.leading", action: reveal)
                }
            }
        }
    }
}
