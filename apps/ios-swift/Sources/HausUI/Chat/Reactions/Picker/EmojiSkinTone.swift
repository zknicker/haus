import Foundation
import HausModels

/// The five Fitzpatrick modifiers and how they apply to an emoji.
enum EmojiSkinTone: CaseIterable, Sendable {
    case light, mediumLight, medium, mediumDark, dark

    var modifier: Unicode.Scalar {
        switch self {
        case .light: "\u{1F3FB}"
        case .mediumLight: "\u{1F3FC}"
        case .medium: "\u{1F3FD}"
        case .mediumDark: "\u{1F3FE}"
        case .dark: "\u{1F3FF}"
        }
    }

    var name: String {
        switch self {
        case .light: "light skin tone"
        case .mediumLight: "medium-light skin tone"
        case .medium: "medium skin tone"
        case .mediumDark: "medium-dark skin tone"
        case .dark: "dark skin tone"
        }
    }

    /// The emoji with every person in it in this tone, or nil when the result
    /// is not one emoji the Server accepts.
    func applied(to emoji: String) -> String? {
        let scalars = Array(Self.base(of: emoji).unicodeScalars)
        let isSequence = scalars.contains("\u{200D}")
        var result = String.UnicodeScalarView()
        for (index, scalar) in scalars.enumerated() {
            // A variation selector right after a toned base is dropped: the
            // modifier already asks for emoji presentation.
            if scalar == "\u{FE0F}", index > 0, result.last == modifier { continue }
            result.append(scalar)
            // 🤝 inside a sequence is the gesture between two people, not a
            // person, and never takes a tone of its own.
            if scalar.properties.isEmojiModifierBase, !(isSequence && scalar == "\u{1F91D}") {
                result.append(modifier)
            }
        }
        return ReactionEmoji.normalized(String(result))
    }

    /// The emoji with its skin tones removed, in its normalized spelling.
    static func base(of emoji: String) -> String {
        let stripped = String(String.UnicodeScalarView(emoji.unicodeScalars.filter { !$0.properties.isEmojiModifier }))
        return ReactionEmoji.normalized(stripped) ?? stripped
    }
}
