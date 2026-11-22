import SwiftUI

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// Inter, the Haus brand font, in the four weights the app bundles. The app
/// registers the faces through `UIAppFonts`; where they are not registered
/// (the package's macOS test host), the system face stands in at the same
/// size and weight.
enum HausTypeface: String, CaseIterable, Sendable {
    case regular = "Inter-Regular"
    case medium = "Inter-Medium"
    case semibold = "Inter-SemiBold"
    case bold = "Inter-Bold"

    /// The face that sets a SwiftUI weight. Lighter weights read as Regular
    /// and heavier ones as Bold, the faces the app carries.
    init(_ weight: Font.Weight) {
        self = switch weight {
        case .medium: .medium
        case .semibold: .semibold
        case .bold, .heavy, .black: .bold
        default: .regular
        }
    }

    /// The face that sets a platform weight, by its nearest bundled weight.
    init(platformWeight weight: CGFloat) {
        self = switch weight {
        case ..<0.115: .regular
        case ..<0.265: .medium
        case ..<0.35: .semibold
        default: .bold
        }
    }

    /// The face one step heavier, which is what an author's bold mark asks for.
    var bolder: HausTypeface {
        switch self {
        case .regular, .medium: .semibold
        case .semibold, .bold: .bold
        }
    }

    var platformWeight: PlatformFont.Weight {
        switch self {
        case .regular: .regular
        case .medium: .medium
        case .semibold: .semibold
        case .bold: .bold
        }
    }

    var fontWeight: Font.Weight {
        switch self {
        case .regular: .regular
        case .medium: .medium
        case .semibold: .semibold
        case .bold: .bold
        }
    }

    /// Whether the app registered Inter in this process.
    static let isRegistered = PlatformFont(name: HausTypeface.regular.rawValue, size: 17) != nil

    /// A SwiftUI font at exactly `size`. Callers that scale with Dynamic Type
    /// scale the size first.
    func font(size: CGFloat) -> Font {
        guard Self.isRegistered else { return .system(size: size, weight: fontWeight) }
        return .custom(rawValue, fixedSize: size)
    }

    /// The platform font for TextKit, at exactly `size`.
    func platformFont(size: CGFloat) -> PlatformFont {
        PlatformFont(name: rawValue, size: size) ?? .systemFont(ofSize: size, weight: platformWeight)
    }

    /// The bundled face behind a platform font, when it is one.
    static func face(of font: PlatformFont) -> HausTypeface? {
        HausTypeface(rawValue: font.fontName)
    }

    /// The bundled face nearest a platform font's weight.
    static func nearest(to font: PlatformFont) -> HausTypeface {
        face(of: font) ?? HausTypeface(platformWeight: weight(of: font))
    }

    /// Inter carries no italic, so an italic run is the upright face slanted
    /// by the font matrix, which keeps its metrics and its line.
    static func oblique(_ font: PlatformFont) -> PlatformFont {
        #if canImport(UIKit)
        let slant = CGAffineTransform(a: 1, b: 0, c: obliqueSlant, d: 1, tx: 0, ty: 0)
        let descriptor = font.fontDescriptor.addingAttributes([.matrix: slant])
        return PlatformFont(descriptor: descriptor, size: font.pointSize)
        #elseif canImport(AppKit)
        return font
        #endif
    }

    /// tan(10°), Inter's own italic angle.
    static let obliqueSlant: CGFloat = 0.176

    private static func weight(of font: PlatformFont) -> CGFloat {
        #if canImport(UIKit)
        let traits = font.fontDescriptor.object(forKey: .traits) as? [UIFontDescriptor.TraitKey: Any]
        #elseif canImport(AppKit)
        let traits = font.fontDescriptor.object(forKey: .traits) as? [NSFontDescriptor.TraitKey: Any]
        #endif
        return (traits?[.weight] as? CGFloat) ?? 0
    }
}
