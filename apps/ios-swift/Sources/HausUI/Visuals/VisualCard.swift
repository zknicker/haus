import SwiftUI

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// One ```visual fence, rendered inline under the message that wrote it.
///
/// The shell is the transcript's own card idiom — the action card's radius, a
/// hairline border, a system surface — and everything inside it is the web
/// card's: no title bar (the title is accessibility only), no padding of its
/// own (the frame body carries 16px), and the same natural document height.
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
            .background(VisualCardMetrics.surface, in: VisualCardMetrics.shape)
            .overlay {
                VisualCardMetrics.shape.strokeBorder(.secondary.opacity(0.18), lineWidth: 0.5)
            }
            .clipShape(VisualCardMetrics.shape)
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

enum VisualCardMetrics {
    /// The in-transcript card corner, inherited from the retired action card so
    /// the cards that hang off a message keep one rhythm.
    static let cornerRadius: CGFloat = 13

    static var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
    }

    static var surface: Color {
        #if canImport(UIKit)
        Color(uiColor: .secondarySystemBackground)
        #else
        Color(nsColor: .controlBackgroundColor)
        #endif
    }
}
