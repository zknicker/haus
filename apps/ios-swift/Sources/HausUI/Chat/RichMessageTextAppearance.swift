import SwiftUI

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// How one block sets its words before the author's own marks are applied: a
/// heading is heavier and a touch larger, a quote is muted, and a paragraph is
/// the body exactly as it has always been.
///
/// The weight travels as a raw value rather than a `PlatformFont.Weight` so the
/// whole description stays a plain, comparable value — the text view keeps the
/// last one it laid out and rebuilds only when it changes.
struct RichMessageTextAppearance: Equatable, Sendable {
    var scale: CGFloat = 1
    var weight: CGFloat?
    var isMuted = false

    static let body = RichMessageTextAppearance()
    static let quote = RichMessageTextAppearance(isMuted: true)

    /// A heading in a chat message is a section label, not a title. The App
    /// sets them barely above its body text, so the phone does the same: one
    /// step of size for the top two levels, and weight for all of them.
    static func heading(level: Int) -> RichMessageTextAppearance {
        RichMessageTextAppearance(
            scale: level <= 1 ? 1.12 : (level == 2 ? 1.06 : 1),
            weight: PlatformFont.Weight.semibold.rawValue
        )
    }

    /// The block's own font: the text style's, resized and reweighted when this
    /// appearance asks for it.
    func font(base: PlatformFont) -> PlatformFont {
        guard scale != 1 || weight != nil else { return base }
        return PlatformFont.systemFont(
            ofSize: (base.pointSize * scale).rounded(),
            weight: weight.map { PlatformFont.Weight(rawValue: $0) } ?? .regular
        )
    }
}

extension RichInlineStyle {
    /// The face one run is set in: the block's own font with the author's marks
    /// applied. Code leaves the family behind for the system monospace at the
    /// same size, which is what keeps a span on the line it sits in.
    func font(base: PlatformFont) -> PlatformFont {
        if contains(.code) {
            return PlatformFont.monospacedSystemFont(
                ofSize: base.pointSize,
                weight: contains(.bold) ? .semibold : .regular
            )
        }
        var traits = base.fontDescriptor.symbolicTraits
        #if canImport(UIKit)
        if contains(.bold) { traits.insert(.traitBold) }
        if contains(.italic) { traits.insert(.traitItalic) }
        guard let descriptor = base.fontDescriptor.withSymbolicTraits(traits) else { return base }
        return PlatformFont(descriptor: descriptor, size: base.pointSize)
        #elseif canImport(AppKit)
        if contains(.bold) { traits.insert(.bold) }
        if contains(.italic) { traits.insert(.italic) }
        let descriptor = base.fontDescriptor.withSymbolicTraits(traits)
        return PlatformFont(descriptor: descriptor, size: base.pointSize) ?? base
        #endif
    }
}
