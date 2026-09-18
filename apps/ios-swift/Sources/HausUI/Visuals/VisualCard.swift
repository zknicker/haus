import SwiftUI

/// One ```visual fence, rendered inline under the message that wrote it.
///
/// There is no shell: the visual is a transparent block in the message column,
/// exactly as on the web (ADR 0031), so the conversation is its container and
/// a tile inside it reads as a plate rather than a card in a card. No title bar
/// (the title is accessibility only), no padding of its own (the frame body
/// insets 8px vertically, nothing horizontally, because the column already
/// supplies the gutter), and the same natural document height.
/// `VisualHeightRegistry` owns measurement at the screen level.
struct VisualCard: View {
    let visual: VisualSegment
    let key: VisualKey
    let heights: VisualHeightRegistry

    @Environment(\.colorScheme) private var colorScheme
    /// The card's text tracks the transcript's: a Dynamic Type change rebuilds
    /// the document, and the frame reloads at the new size.
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let height = heights.height(key) ?? VisualHeights.fallback

        content
            .frame(height: height)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(VisualFence.fallbackText(html: visual.html, title: visual.title))
    }

    @ViewBuilder
    private var content: some View {
        #if canImport(UIKit)
        VisualWebView(
            document: VisualSandboxDocument.make(
                html: visual.html,
                scheme: tokenScheme,
                typography: VisualTypography.resolved(for: dynamicTypeSize)
            )
        ) { reported in
            heights.report(reported, for: key)
        }
        #else
        // macOS exists in this package only so the pure logic can run under
        // `swift test`; the app targets iOS.
        Color.clear
        #endif
    }

    private var tokenScheme: AgentHtmlColorScheme {
        colorScheme == .light ? .light : .dark
    }
}
