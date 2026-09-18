import SwiftUI

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

#if canImport(UIKit)
typealias PlatformFont = UIFont
typealias PlatformColor = UIColor
#elseif canImport(AppKit)
typealias PlatformFont = NSFont
typealias PlatformColor = NSColor
#endif

/// The vertical metrics of the system font behind a `Font.TextStyle`.
struct PlatformFontMetrics: Equatable {
    /// The size the text style resolves to at this Dynamic Type size.
    let pointSize: CGFloat
    /// Height above the baseline, positive.
    let ascent: CGFloat
    /// Depth below the baseline, positive.
    let descent: CGFloat
    /// The gap a line adds beyond `ascent + descent`, positive.
    let leading: CGFloat
    let xHeight: CGFloat
    /// The height of a capital, positive: the top of the label's ink.
    let capHeight: CGFloat

    var lineHeight: CGFloat { ascent + descent + leading }
}

/// The system font behind a `Font.TextStyle`, and its vertical metrics.
///
/// SwiftUI does not expose the font it resolves, and a message body needs both
/// the font itself — to set its words and its mention labels in one run — and
/// its real line box, which is what a reference capsule is sized to. So the
/// platform font is asked for the same style at the same Dynamic Type size.
enum PlatformTextMetrics {
    static func metrics(
        for style: Font.TextStyle,
        dynamicTypeSize: DynamicTypeSize,
        legibilityWeight: LegibilityWeight? = nil
    ) -> PlatformFontMetrics {
        measure(
            font(
                for: style,
                dynamicTypeSize: dynamicTypeSize,
                legibilityWeight: legibilityWeight
            )
        )
    }

    /// The vertical metrics of a font already in hand. A heading sets the body
    /// style at its own size, so the capsule geometry inside it has to be
    /// measured from that font rather than from the text style's.
    static func metrics(of font: PlatformFont) -> PlatformFontMetrics { measure(font) }

    /// The system font a text style resolves to at this Dynamic Type size and
    /// legibility weight.
    ///
    /// The body's words and a mention's label are set in it at the same size,
    /// which is what puts them on one baseline. Bold Text is a trait of the
    /// same resolution, not a separate switch: it has to be asked for here, or
    /// the body stays regular while the rest of the app goes bold.
    static func font(
        for style: Font.TextStyle,
        dynamicTypeSize: DynamicTypeSize,
        legibilityWeight: LegibilityWeight? = nil
    ) -> PlatformFont {
        #if canImport(UIKit)
        return UIFont.preferredFont(
            forTextStyle: uiTextStyle(style),
            compatibleWith: UITraitCollection(traitsFrom: [
                UITraitCollection(
                    preferredContentSizeCategory: contentSizeCategory(dynamicTypeSize)
                ),
                UITraitCollection(legibilityWeight: uiLegibilityWeight(legibilityWeight)),
            ])
        )
        #elseif canImport(AppKit)
        // macOS has no Dynamic Type; the style resolves to one size. Bold Text
        // has no trait collection to carry it either, so the face is asked for
        // directly.
        let base = NSFont.preferredFont(forTextStyle: nsTextStyle(style))
        guard legibilityWeight == .bold else { return base }
        let bold = base.fontDescriptor.withSymbolicTraits(.bold)
        return NSFont(descriptor: bold, size: base.pointSize) ?? base
        #endif
    }

    #if canImport(UIKit)
    private static func uiLegibilityWeight(_ weight: LegibilityWeight?) -> UILegibilityWeight {
        switch weight {
        case .bold: .bold
        case .regular: .regular
        default: .unspecified
        }
    }

    private static func measure(_ font: UIFont) -> PlatformFontMetrics {
        PlatformFontMetrics(
            pointSize: font.pointSize,
            ascent: font.ascender,
            descent: -font.descender,
            leading: max(0, font.lineHeight - font.ascender + font.descender),
            xHeight: font.xHeight,
            capHeight: font.capHeight
        )
    }

    private static func uiTextStyle(_ style: Font.TextStyle) -> UIFont.TextStyle {
        switch style {
        case .largeTitle: .largeTitle
        case .title: .title1
        case .title2: .title2
        case .title3: .title3
        case .headline: .headline
        case .subheadline: .subheadline
        case .callout: .callout
        case .footnote: .footnote
        case .caption: .caption1
        case .caption2: .caption2
        default: .body
        }
    }

    private static func contentSizeCategory(_ size: DynamicTypeSize) -> UIContentSizeCategory {
        switch size {
        case .xSmall: .extraSmall
        case .small: .small
        case .medium: .medium
        case .large: .large
        case .xLarge: .extraLarge
        case .xxLarge: .extraExtraLarge
        case .xxxLarge: .extraExtraExtraLarge
        case .accessibility1: .accessibilityMedium
        case .accessibility2: .accessibilityLarge
        case .accessibility3: .accessibilityExtraLarge
        case .accessibility4: .accessibilityExtraExtraLarge
        case .accessibility5: .accessibilityExtraExtraExtraLarge
        default: .large
        }
    }
    #elseif canImport(AppKit)
    private static func measure(_ font: NSFont) -> PlatformFontMetrics {
        PlatformFontMetrics(
            pointSize: font.pointSize,
            ascent: font.ascender,
            descent: -font.descender,
            leading: max(0, font.leading),
            xHeight: font.xHeight,
            capHeight: font.capHeight
        )
    }

    private static func nsTextStyle(_ style: Font.TextStyle) -> NSFont.TextStyle {
        switch style {
        case .largeTitle: .largeTitle
        case .title: .title1
        case .title2: .title2
        case .title3: .title3
        case .headline: .headline
        case .subheadline: .subheadline
        case .callout: .callout
        case .footnote: .footnote
        case .caption: .caption1
        case .caption2: .caption2
        default: .body
        }
    }
    #endif
}
