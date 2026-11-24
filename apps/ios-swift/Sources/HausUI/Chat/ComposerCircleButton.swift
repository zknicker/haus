import SwiftUI

/// One of the composer's 36pt controls: the bare plus, and the send circle.
struct ComposerCircleButton: View {
    let icon: HausIconName
    let style: ComposerCircleStyle
    let label: String
    let action: () -> Void

    @ScaledMetric(relativeTo: .body) private var diameter: CGFloat = 36
    @ScaledMetric(relativeTo: .body) private var glyphSize: CGFloat = 18

    /// Explicit colors — not the hierarchical `.primary`/`.secondary` styles — so the glass
    /// vibrancy context cannot wash the circle out to grey.
    var body: some View {
        Button(action: action) {
            Circle()
                .fill(style.fill.color)
                .frame(width: diameter, height: diameter)
                .overlay {
                    HausIcon(icon, size: glyphSize * style.glyphScale, weight: 2.2)
                        .foregroundStyle(style.ink.color)
                }
                .compositingGroup()
                .contentShape(.circle)
        }
        .buttonStyle(.pressable)
        .animation(.easeOut(duration: 0.16), value: style)
        .accessibilityLabel(label)
    }
}

/// How a composer circle paints.
struct ComposerCircleStyle: Equatable {
    let fill: HausTone
    let ink: HausTone
    var glyphScale: CGFloat = 1

    /// No circle, and a larger glyph: the plus reads as a control by its place, as ChatGPT's does.
    static func plus(isEnabled: Bool) -> ComposerCircleStyle {
        ComposerCircleStyle(
            fill: HausTone(HausSwatch(0x000000, opacity: 0)),
            ink: isEnabled ? .ink : .faintInk,
            glyphScale: 22.0 / 18.0
        )
    }

    /// Accent with a white arrow when the draft can go; otherwise a visible muted circle.
    static func send(canSend: Bool) -> ComposerCircleStyle {
        canSend
            ? ComposerCircleStyle(fill: .accent, ink: HausTone(HausSwatch(0xFFFFFF)))
            : ComposerCircleStyle(fill: .strongFill, ink: .mutedInk)
    }
}
