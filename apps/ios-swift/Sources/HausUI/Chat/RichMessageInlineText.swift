import SwiftUI

/// Inline content as an `AttributedString`, for the places a `Text` draws the
/// run instead of the transcript's text engine.
///
/// A table cell is the reason this exists. A cell sits inside a `Grid` in a
/// horizontal scroll view, where the column's width is decided by what the
/// cells ask for — and the TextKit view answers that question with the whole
/// paragraph on one line. So a cell draws with `Text`, which costs the painted
/// capsule behind a reference: the chip keeps its identity ink and its weight,
/// and its mark is the one thing a cell does not draw.
enum RichMessageInlineText {
    static func attributed(
        _ segments: [RichMessageSegment],
        textStyle: Font.TextStyle,
        appearance: RichMessageTextAppearance = .body
    ) -> AttributedString {
        var result = AttributedString()
        for segment in segments {
            switch segment {
            case .text(let run, let style):
                result += text(run, style: style, textStyle: textStyle, appearance: appearance)
            case .reference(let reference):
                result += self.reference(reference, textStyle: textStyle)
            case .link(let words, let target):
                result += link(words, target: target, textStyle: textStyle)
            }
        }
        return result
    }

    /// A run read back as the words it draws, for the accessibility label of a
    /// cell and for anything that has to name one.
    static func plainText(_ segments: [RichMessageSegment]) -> String {
        segments.map { segment in
            switch segment {
            case .text(let run, _): run
            case .reference(let reference): reference.label
            case .link(let words, _): words
            }
        }
        .joined()
    }

    private static func text(
        _ run: String,
        style: RichInlineStyle,
        textStyle: Font.TextStyle,
        appearance: RichMessageTextAppearance
    ) -> AttributedString {
        var piece = AttributedString(run)
        piece.font = font(textStyle: textStyle, style: style, appearance: appearance)
        piece.foregroundColor = Color(
            platform: appearance.isMuted
                ? RichReferenceChipInk.mutedText
                : RichReferenceChipInk.bodyText
        )
        if style.contains(.strikethrough) { piece.strikethroughStyle = .single }
        if style.contains(.code) {
            piece.backgroundColor = Color(platform: RichReferenceChipInk.codeGround)
        }
        return piece
    }

    private static func reference(
        _ reference: RichReferencePresentation,
        textStyle: Font.TextStyle
    ) -> AttributedString {
        var piece = AttributedString(reference.label)
        piece.font = .system(textStyle, design: .default, weight: .medium)
        piece.foregroundColor = Color(platform: RichReferenceChipInk.labelTint(for: reference))
        if let url = reference.activationURL { piece.link = url }
        return piece
    }

    private static func link(
        _ words: String,
        target: String,
        textStyle: Font.TextStyle
    ) -> AttributedString {
        var piece = AttributedString(words)
        piece.font = .system(textStyle)
        piece.foregroundColor = Color(platform: RichReferenceChipInk.linkText)
        piece.underlineStyle = .single
        if let url = RichReferenceWireForm.activationURL(for: target) { piece.link = url }
        return piece
    }

    private static func font(
        textStyle: Font.TextStyle,
        style: RichInlineStyle,
        appearance: RichMessageTextAppearance
    ) -> Font {
        var font = Font.system(
            textStyle,
            design: style.contains(.code) ? .monospaced : .default,
            weight: style.contains(.bold)
                ? .semibold
                : appearance.weight.map { Font.Weight($0) } ?? .regular
        )
        if style.contains(.italic) { font = font.italic() }
        return font
    }
}

extension Font.Weight {
    /// The SwiftUI weight behind a `PlatformFont.Weight` raw value, so a block
    /// appearance describes itself once for both text engines.
    init(_ rawValue: CGFloat) {
        switch rawValue {
        case ...PlatformFont.Weight.light.rawValue: self = .light
        case ...PlatformFont.Weight.regular.rawValue: self = .regular
        case ...PlatformFont.Weight.medium.rawValue: self = .medium
        case ...PlatformFont.Weight.semibold.rawValue: self = .semibold
        default: self = .bold
        }
    }
}

extension Color {
    /// The SwiftUI color behind a platform color, without a `#if` at every
    /// call site.
    init(platform color: PlatformColor) {
        #if canImport(UIKit)
        self.init(uiColor: color)
        #else
        self.init(nsColor: color)
        #endif
    }
}
