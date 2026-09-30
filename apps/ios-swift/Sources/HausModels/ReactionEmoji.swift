import Foundation

/// The Server's single-emoji rule (`normalizeReactionEmoji` in
/// `packages/haus-api/src/reaction-emoji.ts`), so the phone only sends what an
/// Agent would be allowed to send and `❤` and `❤️` group together.
public enum ReactionEmoji {
    /// The fully qualified spelling of exactly one emoji grapheme, or nil for
    /// text, several emoji, or a bare digit, `#`, or `*`.
    public static func normalized(_ input: String) -> String? {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count == 1,
              trimmed.unicodeScalars.allSatisfy(isSequenceScalar),
              trimmed.unicodeScalars.contains(where: isAnchor)
        else { return nil }
        let points = Array(trimmed.unicodeScalars.filter { $0 != textSelector && $0 != emojiSelector })
        var result = String.UnicodeScalarView()
        for (index, point) in points.enumerated() {
            result.append(point)
            let next = index + 1 < points.count ? points[index + 1] : nil
            if needsEmojiPresentation(point, next: next) { result.append(emojiSelector) }
        }
        return String(result)
    }

    private static let textSelector: Unicode.Scalar = "\u{FE0E}"
    private static let emojiSelector: Unicode.Scalar = "\u{FE0F}"
    private static let keycap: Unicode.Scalar = "\u{20E3}"

    /// Emoji, their components (ZWJ, keycap, skin tones, regional indicators,
    /// tags), and either variation selector.
    private static func isSequenceScalar(_ scalar: Unicode.Scalar) -> Bool {
        scalar.properties.isEmoji || isComponent(scalar) || scalar == textSelector || scalar == emojiSelector
    }

    private static func isComponent(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.value {
        case 0x200D, 0x20E3, 0x1F1E6...0x1F1FF, 0x1F3FB...0x1F3FF, 0x1F9B0...0x1F9B3, 0xE0020...0xE007F:
            true
        default:
            false
        }
    }

    /// Something pictographic must anchor the sequence: a lone digit, `#`, or
    /// `*` is an emoji code point too.
    private static func isAnchor(_ scalar: Unicode.Scalar) -> Bool {
        if scalar == keycap || (0x1F1E6...0x1F1FF).contains(scalar.value) { return true }
        return scalar.properties.isEmoji && !isKeycapBase(scalar) && !isComponent(scalar)
    }

    private static func isKeycapBase(_ scalar: Unicode.Scalar) -> Bool {
        ("0"..."9").contains(scalar) || scalar == "#" || scalar == "*"
    }

    /// Text-default emoji such as ❤ take U+FE0F, except before a skin tone;
    /// keycap bases take it only before U+20E3.
    private static func needsEmojiPresentation(_ point: Unicode.Scalar, next: Unicode.Scalar?) -> Bool {
        guard point.properties.isEmoji, !point.properties.isEmojiPresentation else { return false }
        if let next, next.properties.isEmojiModifier { return false }
        return isKeycapBase(point) ? next == keycap : true
    }
}
