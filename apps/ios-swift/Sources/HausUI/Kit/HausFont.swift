import SwiftUI

/// The one place Haus type is chosen: Inter (`HausTypeface`) at an exact size.
/// `hausFont(_:)` scales a role's size with Dynamic Type before it gets here.
enum HausFont {
    static func font(size: CGFloat, weight: Font.Weight = .regular) -> Font {
        HausTypeface(weight).font(size: size)
    }
}

/// A text role from the mocks: its size at the default text size, its weight,
/// and the text style it scales with under Dynamic Type.
struct HausTextRole: Equatable, Sendable {
    let size: CGFloat
    let weight: Font.Weight
    let textStyle: Font.TextStyle

    static let chip = HausTextRole(size: 15, weight: .medium, textStyle: .subheadline)
    static let screenTitle = HausTextRole(size: 17, weight: .medium, textStyle: .headline)
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
    @Environment(\.legibilityWeight) private var legibilityWeight

    init(role: HausTextRole) {
        self.role = role
        _size = ScaledMetric(wrappedValue: role.size, relativeTo: role.textStyle)
    }

    func body(content: Content) -> some View {
        content.font(HausFont.font(size: size, weight: legibilityWeight == .bold ? role.boldTextWeight : role.weight))
    }
}

extension HausTextRole {
    /// The role's weight under Bold Text: a fixed custom face does not take
    /// the system's bolder step on its own.
    var boldTextWeight: Font.Weight {
        HausTypeface(weight).bolder.fontWeight
    }
}
