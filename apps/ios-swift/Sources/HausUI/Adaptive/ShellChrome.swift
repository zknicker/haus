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

    /// The safe-area edges a Chat or Task transcript runs past. Stock bars
    /// stand in the leading or trailing safe area, so a transcript stops at
    /// them and runs past only the header and the composer.
    public var transcriptIgnoredEdges: Edge.Set {
        switch self {
        case .custom: .all
        case .stock: .vertical
        }
    }

    /// The system tab bar under the router's `showsTabBar` rule. It is set on
    /// the tab's content: on vertical bars a pushed screen's own visibility
    /// never reaches the rail.
    public func tabBar(showsTabBar: Bool) -> Visibility {
        self == .stock && showsTabBar ? .visible : .hidden
    }
}

extension EnvironmentValues {
    @Entry public var shellChrome = ShellChrome.custom
}

extension View {
    /// The keyboard shortens the vertical bars, and the system then drops
    /// either the toolbar's items or the tab bar. A conversation keeps its
    /// items (Call, Files, the Task's More), which act on the place being
    /// typed into; switching tabs mid-sentence can wait.
    public func keepsToolbarItemsWhileTyping() -> some View {
        modifier(ToolbarItemsWhileTyping())
    }
}

private struct ToolbarItemsWhileTyping: ViewModifier {
    func body(content: Content) -> some View {
        #if os(iOS)
        if #available(iOS 27.1, *) {
            content.toolbarVerticalCompressionBehavior(.prefersToolbarItems)
        } else {
            content
        }
        #else
        content
        #endif
    }
}

/// Builds the shell with `ShellChrome` read straight from the environment, so
/// the first frame already draws the right bars. Below iOS 27.1 bars are never
/// vertical, so the size class alone decides: an iPhone Plus or Pro Max turned
/// to landscape is regular width and splits under stock bars.
public struct ShellChromeScope<Content: View>: View {
    private let content: (ShellChrome) -> Content

    public init(@ViewBuilder content: @escaping (ShellChrome) -> Content) {
        self.content = content
    }

    public var body: some View {
        #if os(iOS)
        if #available(iOS 27.1, *) {
            VerticalBarsScope(content: content)
        } else {
            SizeClassScope(content: content)
        }
        #else
        content(.custom).environment(\.shellChrome, .custom)
        #endif
    }
}

#if os(iOS)
private struct SizeClassScope<Content: View>: View {
    @Environment(\.horizontalSizeClass) private var sizeClass
    let content: (ShellChrome) -> Content

    var body: some View {
        let chrome = ShellChrome(barsAreVertical: false, isRegularWidth: sizeClass == .regular)
        content(chrome).environment(\.shellChrome, chrome)
    }
}

@available(iOS 27.1, *)
private struct VerticalBarsScope<Content: View>: View {
    @Environment(\.toolbarVerticalEdge) private var verticalEdge
    @Environment(\.horizontalSizeClass) private var sizeClass
    let content: (ShellChrome) -> Content

    var body: some View {
        let chrome = ShellChrome(barsAreVertical: verticalEdge != nil, isRegularWidth: sizeClass == .regular)
        content(chrome).environment(\.shellChrome, chrome)
    }
}
#endif
