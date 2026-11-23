import SwiftUI

/// The composer's glass shell.
///
/// The shell is `interactive()` system glass end to end: fill, rim, and the press-driven
/// bloom that brightens the fill and flexes the shape past its own bounds are all the system's.
/// Nothing may be overlaid on top of it — an overlay is a static layer and cannot travel with the
/// bloom, so it would double-draw the edge the moment the glass flexes under a touch.
struct ComposerGlassSurface: ViewModifier {
    let cornerRadius: CGFloat

    func body(content: Content) -> some View {
        // Untinted. A tint is what turns a glass composer into ChatGPT's flat grey slab, and
        // `.primary` in particular is the style glass vibrancy is most likely to wash out.
        content.glassEffect(.regular.interactive(), in: .rect(cornerRadius: cornerRadius))
    }
}

/// The corners the composer's glass family is cut with.
///
/// The input rounds harder as it expands. Anything else standing on the composer — the mention card
/// — takes the resting corner, one step inside the shell it rises from, so the two read as a pair
/// rather than as one shape repeated.
enum ComposerSurfaceMetrics {
    static let restingCornerRadius: CGFloat = 24
    static let expandedCornerRadius: CGFloat = 28
    /// The composer's side margin, resting and expanded alike.
    static let sideMargin: CGFloat = 16
    /// The inset of the 36pt circles inside the shell: (47 − 36) / 2 at rest.
    static let restingControlInset: CGFloat = 5.5
    static let expandedControlInset: CGFloat = 6
    /// How far below the screen's top edge a full-height card stops, so the chat header's
    /// title and circles stay clear above it.
    static let fullHeightTopClearance: CGFloat = 116
}

extension View {
    func composerGlassSurface(cornerRadius: CGFloat) -> some View {
        modifier(ComposerGlassSurface(cornerRadius: cornerRadius))
    }
}
