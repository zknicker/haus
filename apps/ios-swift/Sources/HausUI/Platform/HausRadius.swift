import SwiftUI

/// The corner scale, beside `HausPlatformColor` as the app's other design
/// token. A surface picks its tier by role, never by eye, and every corner is
/// `.continuous`, so two surfaces of one tier always share a shape.
///
/// A box forced to an exact side (an icon mark, a thumbnail) does not take a
/// tier: its corner is derived from the box, so the shape holds as the box
/// scales with Dynamic Type.
enum HausRadius {
    /// Text-run plates that sit inside a line, such as inline code.
    static let inline: CGFloat = 4
    /// Compact controls: an emoji cell's press, a small fill behind a glyph.
    static let small: CGFloat = 8
    /// Content inside a transcript or list row: cards, code blocks, image
    /// tiles, press and highlight tints, the action list, search fields.
    static let medium: CGFloat = 12
    /// Standalone surfaces: an emphasized Thread anchor, task metadata, and
    /// the banners that float over a screen.
    static let large: CGFloat = 16
    /// Grouped sections on a sheet, such as Settings lists.
    static let grouped: CGFloat = 22

    /// An icon mark's box: a third of its side, the Channel icon's shape.
    static func mark(side: CGFloat) -> CGFloat {
        side / 3
    }

    /// A box nested inside a rounded surface, inset from its edge: concentric
    /// with the surface rather than a tier of its own.
    static func nested(in outer: CGFloat, inset: CGFloat) -> CGFloat {
        max(outer - inset, 0)
    }
}

extension Shape where Self == RoundedRectangle {
    /// A continuous rounded rectangle at a `HausRadius` corner.
    static func haus(_ radius: CGFloat) -> RoundedRectangle {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
    }
}
