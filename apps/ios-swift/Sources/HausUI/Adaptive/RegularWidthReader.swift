import SwiftUI

extension View {
    /// Calls `action` with whether the horizontal size class is regular, now
    /// and on every change. Layout follows size classes, never orientation.
    public func onRegularWidthChange(_ action: @escaping (Bool) -> Void) -> some View {
        modifier(RegularWidthReader(action: action))
    }
}

private struct RegularWidthReader: ViewModifier {
    @Environment(\.horizontalSizeClass) private var sizeClass
    let action: (Bool) -> Void

    func body(content: Content) -> some View {
        content.onChange(of: sizeClass, initial: true) { _, sizeClass in
            action(sizeClass == .regular)
        }
    }
}
