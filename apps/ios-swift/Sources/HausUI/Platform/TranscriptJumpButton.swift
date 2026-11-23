import SwiftUI

/// An explicit jump that floats over a transcript: a 36pt glass circle with a
/// chevron pointing where it goes.
///
/// Unlike header chrome, it sits directly on running text, and clear glass
/// there reads as a glyph lying on the words. So it is the prominent glass
/// style tinted with the screen's own background: the lens still refracts and
/// still owns its press, but the circle reads as a solid object above the text.
struct TranscriptJumpButton: View {
    enum Direction {
        /// Toward the latest message.
        case down
        /// Toward older history, such as the first unread message.
        case up
    }

    let label: String
    var direction = Direction.down
    let action: () -> Void

    static let diameter: CGFloat = 36
    static let glyphSize: CGFloat = 18
    /// The prominent glass style pads its label by this much on every side.
    private static let glassButtonInset: CGFloat = 7

    var body: some View {
        Button(action: action) {
            HausIcon(.arrowDown, size: Self.glyphSize, weight: GlassChromeButton.iconGlyphWeight)
                .rotationEffect(direction == .up ? .degrees(180) : .zero)
                .foregroundStyle(HausPlatformColor.label)
                .frame(
                    width: Self.diameter - Self.glassButtonInset * 2,
                    height: Self.diameter - Self.glassButtonInset * 2
                )
        }
        .buttonStyle(.glassProminent)
        .buttonBorderShape(.circle)
        .tint(HausPlatformColor.canvas.opacity(0.78))
        .fixedSize()
        .accessibilityLabel(label)
    }
}
