import SwiftUI

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// One sRGB value from the Haus palette, at an opacity.
struct HausSwatch: Equatable, Sendable {
    let rgb: UInt32
    let opacity: Double

    init(_ rgb: UInt32, opacity: Double = 1) {
        self.rgb = rgb
        self.opacity = opacity
    }

    var red: Double { Double((rgb >> 16) & 0xFF) / 255 }
    var green: Double { Double((rgb >> 8) & 0xFF) / 255 }
    var blue: Double { Double(rgb & 0xFF) / 255 }
}

/// A palette color that follows the color scheme: one swatch for dark, one for light.
struct HausTone: Equatable, Sendable {
    let dark: HausSwatch
    let light: HausSwatch

    init(dark: HausSwatch, light: HausSwatch) {
        self.dark = dark
        self.light = light
    }

    /// A tone that reads the same on both schemes.
    init(_ fixed: HausSwatch) {
        self.init(dark: fixed, light: fixed)
    }

    func swatch(for scheme: ColorScheme) -> HausSwatch {
        scheme == .dark ? dark : light
    }

    /// The tone as a color that resolves against the environment's scheme.
    var color: Color {
        let tone = self
        #if canImport(UIKit)
        return Color(uiColor: UIColor { traits in
            tone.swatch(for: traits.userInterfaceStyle == .dark ? .dark : .light).uiColor
        })
        #else
        return Color(nsColor: NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            return tone.swatch(for: isDark ? .dark : .light).nsColor
        })
        #endif
    }
}

#if canImport(UIKit)
private extension HausSwatch {
    var uiColor: UIColor {
        UIColor(red: red, green: green, blue: blue, alpha: opacity)
    }
}
#else
private extension HausSwatch {
    var nsColor: NSColor {
        NSColor(srgbRed: red, green: green, blue: blue, alpha: opacity)
    }
}
#endif
