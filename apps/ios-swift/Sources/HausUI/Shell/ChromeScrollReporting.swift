import SwiftUI

/// A tab root list's scroll position, as the shell's bottom chrome reads it.
public struct ChromeScrollMetrics: Equatable, Sendable {
    public let offset: Double
    public let topInset: Double
    public let bottomInset: Double
    public let content: Double
    public let container: Double
}

extension EnvironmentValues {
    /// Set by the shell on a tab root; a root list reports its scrolling to it.
    @Entry public var chromeScroll: (@MainActor (ChromeScrollMetrics, ChromeScrollMetrics) -> Void)?
}

extension View {
    /// Reports this scroll view's movement to the shell's bottom chrome.
    /// `onScrollGeometryChange` reads only the scroll view it is attached to,
    /// so each root list carries this itself.
    public func reportsChromeScroll() -> some View {
        modifier(ChromeScrollReporter())
    }
}

private struct ChromeScrollReporter: ViewModifier {
    @Environment(\.chromeScroll) private var report

    func body(content: Content) -> some View {
        content.onScrollGeometryChange(for: ChromeScrollMetrics.self) { geometry in
            ChromeScrollMetrics(
                offset: geometry.contentOffset.y,
                topInset: geometry.contentInsets.top,
                bottomInset: geometry.contentInsets.bottom,
                content: geometry.contentSize.height,
                container: geometry.containerSize.height
            )
        } action: { old, new in
            report?(old, new)
        }
    }
}
