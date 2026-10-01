import SwiftUI

extension View {
    /// The tint behind a transcript message: a revealed message's highlight,
    /// or the row a finger is holding and whose drawer is open. It never
    /// changes the row's layout, so a tinted message keeps the timeline's
    /// ordinary rhythm. A `card` row already sits on the input surface, so its
    /// press darkens the card instead.
    func messageRowTint(isHighlighted: Bool = false, isPressed: Bool, card: Bool = false) -> some View {
        modifier(MessageRowTint(isHighlighted: isHighlighted, isPressed: isPressed, card: card))
    }
}

private struct MessageRowTint: ViewModifier {
    let isHighlighted: Bool
    let isPressed: Bool
    let card: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        if card {
            content.overlay {
                RoundedRectangle(cornerRadius: 16)
                    .fill(.primary.opacity(0.06))
                    .opacity(isPressed ? 1 : 0)
                    .animation(pressAnimation, value: isPressed)
                    .allowsHitTesting(false)
            }
        } else {
            content.background {
                RoundedRectangle(cornerRadius: 12)
                    .fill(HausPlatformColor.inputSurface)
                    .opacity(isHighlighted || isPressed ? 1 : 0)
                    .animation(pressAnimation, value: isPressed)
                    .padding(.horizontal, -8)
                    .padding(.vertical, -5)
            }
        }
    }

    /// Scoped to the tint alone: quick in under a resting finger, a little
    /// slower out as the finger lifts or the drawer leaves.
    private var pressAnimation: Animation? {
        reduceMotion ? nil : .easeOut(duration: isPressed ? 0.15 : 0.25)
    }
}
