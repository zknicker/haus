import SwiftUI

/// Press feedback for buttons that draw their own content.
///
/// On iOS 26 system glass owns the whole press treatment, so glass controls
/// never use this. Everything else that `.plain` leaves inert — drawn
/// circles, cards, list rows — takes one of two treatments: compact controls
/// scale toward the finger, and full-width rows highlight instead, because a
/// row that shrinks reads as breakage rather than a press.
struct PressableButtonStyle: ButtonStyle {
    enum Treatment {
        case scale
        case rowHighlight(cornerRadius: CGFloat)
    }

    let treatment: Treatment

    func makeBody(configuration: Configuration) -> some View {
        switch treatment {
        case .scale:
            configuration.label
                .scaleEffect(configuration.isPressed ? 0.96 : 1)
                .opacity(configuration.isPressed ? 0.85 : 1)
                .animation(
                    .spring(response: 0.28, dampingFraction: 0.85),
                    value: configuration.isPressed
                )
        case .rowHighlight(let cornerRadius):
            configuration.label
                .background {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(
                            HausPlatformColor.label
                                .opacity(configuration.isPressed ? 0.06 : 0)
                        )
                }
                .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
        }
    }
}

extension ButtonStyle where Self == PressableButtonStyle {
    /// Compact drawn controls: icon circles, the send button, floating cards.
    static var pressable: PressableButtonStyle { .init(treatment: .scale) }

    /// Full-width tappable rows.
    static var pressableRow: PressableButtonStyle { pressableRow(cornerRadius: HausRadius.medium) }

    static func pressableRow(cornerRadius: CGFloat) -> PressableButtonStyle {
        .init(treatment: .rowHighlight(cornerRadius: cornerRadius))
    }
}
