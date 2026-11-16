import SwiftUI

extension View {
    /// The tint behind a transcript message: a revealed message's highlight,
    /// or the row a finger is holding and whose drawer is open. It never
    /// changes the row's layout, so a tinted message keeps the timeline's
    /// ordinary rhythm.
    func messageRowTint(isHighlighted: Bool = false, isPressed: Bool) -> some View {
        modifier(MessageRowTint(isHighlighted: isHighlighted, isPressed: isPressed))
    }
}

private struct MessageRowTint: ViewModifier {
    let isHighlighted: Bool
    let isPressed: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.background {
            RoundedRectangle.haus(HausRadius.medium)
                .fill(HausPlatformColor.inputSurface)
                .opacity(isHighlighted || isPressed ? 1 : 0)
                .animation(pressAnimation, value: isPressed)
                .padding(.horizontal, -8)
                .padding(.vertical, -5)
        }
    }

    /// Scoped to the tint alone: quick in under a resting finger, a little
    /// slower out as the finger lifts or the drawer leaves.
    private var pressAnimation: Animation? {
        reduceMotion ? nil : .easeOut(duration: isPressed ? 0.15 : 0.25)
    }
}
