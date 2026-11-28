import SwiftUI

/// Which bars the shell draws (specs/ios-app.md, iPhone Duo). Wherever the
/// system lays bars out vertically, or the width is regular, Haus uses the
/// system's tab bar and toolbars. Haus's own bottom chrome and floating Chat
/// header stay on compact displays with horizontal bars: regular iPhones.
public enum ShellChrome: Hashable, Sendable {
    case custom
    case stock

    public init(barsAreVertical: Bool, isRegularWidth: Bool) {
        self = barsAreVertical || isRegularWidth ? .stock : .custom
    }
}

extension EnvironmentValues {
    @Entry public var shellChrome = ShellChrome.custom
}

extension View {
    public func onShellChromeChange(_ action: @escaping (ShellChrome) -> Void) -> some View {
        modifier(ShellChromeReader(action: action))
    }
}

private struct ShellChromeReader: ViewModifier {
    @Environment(\.horizontalSizeClass) private var sizeClass
    let action: (ShellChrome) -> Void

    func body(content: Content) -> some View {
        #if os(iOS)
        if #available(iOS 27.1, *) {
            content.modifier(VerticalBarsReader(isRegularWidth: sizeClass == .regular, action: action))
        } else {
            content.onAppear { action(.custom) }
        }
        #else
        content.onAppear { action(.custom) }
        #endif
    }
}

#if os(iOS)
@available(iOS 27.1, *)
private struct VerticalBarsReader: ViewModifier {
    @Environment(\.toolbarVerticalEdge) private var verticalEdge
    let isRegularWidth: Bool
    let action: (ShellChrome) -> Void

    func body(content: Content) -> some View {
        content.onChange(of: chrome, initial: true) { _, chrome in action(chrome) }
    }

    private var chrome: ShellChrome {
        ShellChrome(barsAreVertical: verticalEdge != nil, isRegularWidth: isRegularWidth)
    }
}
#endif
