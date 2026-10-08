import SwiftUI

/// The scroll-to-latest control that floats over a transcript.
///
/// Unlike header chrome, it sits directly on running text, and clear glass
/// there reads as a glyph lying on the words. So it is the prominent glass
/// style tinted with the screen's own background: the lens still refracts and
/// still owns its press, but the circle reads as a solid object above the text. Before iOS 26
/// the shared chrome button's material, rim, and lift already do that job.
struct TranscriptJumpButton: View {
    let label: String
    let action: () -> Void

    var body: some View {
        if #available(iOS 26, macOS 26, *) {
            Button(action: action) {
                HausIcon(
                    .arrowDown,
                    size: GlassChromeButton.iconGlyphSize,
                    weight: GlassChromeButton.iconGlyphWeight
                )
                .foregroundStyle(HausPlatformColor.label)
                // The prominent style pads its label like the plain glass one.
                .frame(width: GlassChromeButton.diameter - 14, height: GlassChromeButton.diameter - 14)
            }
            .buttonStyle(.glassProminent)
            .buttonBorderShape(.circle)
            .tint(HausPlatformColor.background.opacity(0.78))
            .fixedSize()
            .accessibilityLabel(label)
        } else {
            GlassChromeButton(.icon(.arrowDown), label: label, action: action)
        }
    }
}
