import SwiftUI

/// The Haus palette from the approved iPhone mocks, dark first.
extension HausTone {
    /// The screen ground.
    static let canvas = HausTone(dark: HausSwatch(0x141415), light: HausSwatch(0xF6F6F7))
    /// A sheet or panel lifted off the canvas.
    static let elevatedCanvas = HausTone(dark: HausSwatch(0x18181A), light: HausSwatch(0xFFFFFF))
    /// Grouped cards on the canvas.
    static let card = HausTone(dark: HausSwatch(0x1E1E20), light: HausSwatch(0xFFFFFF))
    /// Chips, tags, and inline plates.
    static let fill = HausTone(dark: HausSwatch(0x262628), light: HausSwatch(0xEFEFF1))
    /// A fill one step stronger, for a control sitting on glass.
    static let strongFill = HausTone(dark: HausSwatch(0x3A3A3C), light: HausSwatch(0xE2E2E5))
    /// Primary text and glyphs.
    static let ink = HausTone(dark: HausSwatch(0xECECEE), light: HausSwatch(0x18181B))
    /// Secondary text: section labels, metadata.
    static let mutedInk = HausTone(dark: HausSwatch(0x8A8A8E), light: HausSwatch(0x6E6E74))
    /// Tertiary text and quiet glyphs.
    static let faintInk = HausTone(dark: HausSwatch(0x68686C), light: HausSwatch(0x9A9AA0))
    /// Rules between rows.
    static let hairline = HausTone(
        dark: HausSwatch(0xFFFFFF, opacity: 0.07),
        light: HausSwatch(0x000000, opacity: 0.07)
    )
    /// The 1pt edge that keeps an unselected chip or a glass surface off the canvas.
    static let edge = HausTone(
        dark: HausSwatch(0xFFFFFF, opacity: 0.07),
        light: HausSwatch(0x000000, opacity: 0.06)
    )
    /// Haus blue, for fills that carry white glyphs.
    static let accent = HausTone(HausSwatch(0x0485F7))
    /// Haus blue for text and glyphs, tuned per scheme for contrast.
    static let accentInk = HausTone(dark: HausSwatch(0x5AA9FA), light: HausSwatch(0x0473D6))
    /// A selected chip's fill: it inverts against the canvas.
    static let selectedFill = HausTone(dark: HausSwatch(0xE8E8EA), light: HausSwatch(0x18181B))
    /// A selected chip's label.
    static let selectedInk = HausTone(dark: HausSwatch(0x141415), light: HausSwatch(0xFFFFFF))
    static let positive = HausTone(HausSwatch(0x30C57A))
    static let caution = HausTone(HausSwatch(0xE8B04B))
    static let critical = HausTone(HausSwatch(0xE5675F))
}

extension HausPlatformColor {
    static var accent: Color { HausTone.accent.color }
    static var accentInk: Color { HausTone.accentInk.color }
    static var canvas: Color { HausTone.canvas.color }
    static var elevatedCanvas: Color { HausTone.elevatedCanvas.color }
    static var card: Color { HausTone.card.color }
    static var fill: Color { HausTone.fill.color }
    static var strongFill: Color { HausTone.strongFill.color }
    static var ink: Color { HausTone.ink.color }
    static var mutedInk: Color { HausTone.mutedInk.color }
    static var faintInk: Color { HausTone.faintInk.color }
    static var hairline: Color { HausTone.hairline.color }
    static var edge: Color { HausTone.edge.color }
    static var selectedFill: Color { HausTone.selectedFill.color }
    static var selectedInk: Color { HausTone.selectedInk.color }
    static var positive: Color { HausTone.positive.color }
    static var caution: Color { HausTone.caution.color }
    static var critical: Color { HausTone.critical.color }
}
