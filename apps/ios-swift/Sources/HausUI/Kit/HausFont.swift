import SwiftUI

/// The one place Haus type is chosen. Every kit component reaches its font
/// through here, so bringing in Inter is a change to `font(size:weight:)` alone.
enum HausFont {
    static func font(size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight)
    }
}

/// A text role from the mocks: its size at the default text size, its weight,
/// and the text style it scales with under Dynamic Type.
struct HausTextRole: Equatable, Sendable {
    let size: CGFloat
    let weight: Font.Weight
    let textStyle: Font.TextStyle

    static let chip = HausTextRole(size: 16, weight: .medium, textStyle: .callout)
    static let chipGlyph = HausTextRole(size: 12, weight: .semibold, textStyle: .callout)
    static let sectionLabel = HausTextRole(size: 15, weight: .regular, textStyle: .subheadline)
    static let toast = HausTextRole(size: 15, weight: .regular, textStyle: .subheadline)
    static let workPill = HausTextRole(size: 15, weight: .regular, textStyle: .subheadline)
    static let workPillChevron = HausTextRole(size: 10, weight: .bold, textStyle: .subheadline)
}

extension View {
    /// Sets the font for a Haus text role, scaled with Dynamic Type.
    func hausFont(_ role: HausTextRole) -> some View {
        modifier(HausFontModifier(role: role))
    }
}

private struct HausFontModifier: ViewModifier {
    let role: HausTextRole
    @ScaledMetric private var size: CGFloat

    init(role: HausTextRole) {
        self.role = role
        _size = ScaledMetric(wrappedValue: role.size, relativeTo: role.textStyle)
    }

    func body(content: Content) -> some View {
        content.font(HausFont.font(size: size, weight: role.weight))
    }
}
