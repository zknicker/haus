import SwiftUI

/// The single circular icon control for app chrome.
///
/// Every floating or header chrome control renders through this view, so the
/// circle, glyph metrics, and glass treatment stay identical on every screen.
/// Callers choose a glyph and a label; they never restyle the control.
struct GlassChromeButton: View {
    enum Glyph {
        case icon(HausIconName)
        case sidebar
        /// An SF Symbol, for the few controls where the system owns the
        /// grammar and the app icon set carries no equivalent — the share
        /// action's arrow-out-of-tray being the one people read as "share".
        case system(String)
    }

    static let diameter: CGFloat = 44
    static let iconGlyphSize: CGFloat = 22
    /// The stroke-rounded family draws at 1.5 on its 24pt grid, which reads
    /// thin at chrome size against a glass circle.
    static let iconGlyphWeight: CGFloat = 2

    private let glyph: Glyph
    private let label: String
    private let action: () -> Void

    init(_ glyph: Glyph, label: String, action: @escaping () -> Void) {
        self.glyph = glyph
        self.label = label
        self.action = action
    }

    /// The glass button style owns its own padding, so the label is inset by
    /// that amount to land the drawn circle back on the shared `diameter`.
    /// Measured against the style, not guessed: a `diameter`-sized label came
    /// out at `diameter + glassButtonInset * 2`.
    private static let glassButtonInset: CGFloat = 7

    /// Liquid Glass owns the whole press treatment: it lights, lifts, and
    /// settles the circle itself, so nothing is drawn around the glass.
    var body: some View {
        Button(action: action) {
            glyphContent
                .frame(
                    width: Self.diameter - Self.glassButtonInset * 2,
                    height: Self.diameter - Self.glassButtonInset * 2
                )
        }
        .buttonStyle(.glass)
        .buttonBorderShape(.circle)
        .foregroundStyle(HausPlatformColor.label)
        .fixedSize()
        .accessibilityLabel(label)
    }

    @ViewBuilder
    private var glyphContent: some View {
        switch glyph {
        case .icon(let name):
            HausIcon(name, size: Self.iconGlyphSize, weight: Self.iconGlyphWeight)
        case .sidebar:
            SidebarMenuGlyph()
        case .system(let name):
            Image(systemName: name)
                .font(.system(size: Self.iconGlyphSize - 3, weight: .semibold))
        }
    }
}

extension View {
    /// Header chrome draws its glyphs in the label color, never the accent:
    /// a system toolbar button takes its glyph color from the tint.
    func hausHeaderGlyph() -> some View {
        tint(HausPlatformColor.label)
    }
}

private struct SidebarMenuGlyph: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Capsule().fill(HausPlatformColor.label).frame(width: 21, height: 2.5)
            Capsule().fill(HausPlatformColor.label).frame(width: 14, height: 2.5)
        }
        .accessibilityHidden(true)
    }
}

#Preview {
    HStack(spacing: 16) {
        GlassChromeButton(.sidebar, label: "Open navigation") {}
        GlassChromeButton(.icon(.search), label: "Search messages") {}
        GlassChromeButton(.icon(.close), label: "Close settings") {}
        GlassChromeButton(.icon(.settings), label: "Settings") {}
    }
    .padding()
}
