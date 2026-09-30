#if canImport(UIKit)
import CoreImage
import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

/// Die-cut emoji sticker bitmaps, rendered once per emoji, finish, and display scale.
///
/// The glyph is drawn at a 160pt font — Apple's emoji bitmap size, eight times
/// the 20pt sticker — so the stamp's 8× fall never upscales past what was drawn
/// and the resting sticker is supersampled. The outline is a round brush:
/// blur the glyph's alpha, threshold it back to a hard edge, and fill that
/// white, which follows every tip with a rounded edge where a morphological
/// dilation would square pointed tips off. A soft, close shadow under the
/// outline keeps the sticker pressed onto the page. The outline's colour and
/// the shadow's weight come from the appearance (`StickerFinish`). The same recipe as the App's
/// SVG die-cut filter, at the same numbers.
enum StickerImageRenderer {
    /// The glyph's drawn font size; the sticker shows it at 1/8.
    static let glyphSize: CGFloat = 160
    /// The sticker's size on screen relative to the drawn glyph.
    static let displayScale: CGFloat = 20 / glyphSize
    private static let padding: CGFloat = 64
    private static let outlineBlur: CGFloat = 8
    private static let shadowBlur: CGFloat = 5
    private static let shadowOffset: CGFloat = 5

    /// Cached synchronously so a recycled row paints its stickers on the
    /// first frame.
    static func cached(_ emoji: String, finish: StickerFinish, scale: CGFloat) -> UIImage? {
        cache.object(forKey: key(emoji, finish, scale))
    }

    static func image(_ emoji: String, finish: StickerFinish, scale: CGFloat) async -> UIImage? {
        if let hit = cached(emoji, finish: finish, scale: scale) { return hit }
        let rendered = await Task.detached(priority: .userInitiated) {
            render(emoji, finish: finish, scale: scale)
        }.value
        if let rendered { cache.setObject(rendered, forKey: key(emoji, finish, scale)) }
        return rendered
    }

    private static func render(_ emoji: String, finish: StickerFinish, scale: CGFloat) -> UIImage? {
        let font = UIFont.systemFont(ofSize: glyphSize)
        let text = NSAttributedString(string: emoji, attributes: [.font: font])
        let glyph = text.size()
        let size = CGSize(width: ceil(glyph.width + padding * 2), height: ceil(glyph.height + padding * 2))
        let format = UIGraphicsImageRendererFormat()
        format.scale = scale
        format.opaque = false
        let source = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            text.draw(at: CGPoint(x: padding, y: padding))
        }
        guard let cgSource = source.cgImage else { return nil }

        let pixels = scale
        let input = CIImage(cgImage: cgSource)
        let extent = input.extent
        let alpha = input.applyingFilter("CIColorMatrix", parameters: [
            "inputRVector": CIVector(x: 0, y: 0, z: 0, w: 0),
            "inputGVector": CIVector(x: 0, y: 0, z: 0, w: 0),
            "inputBVector": CIVector(x: 0, y: 0, z: 0, w: 0),
        ])
        let edge = alpha
            .clampedToExtent()
            .applyingGaussianBlur(sigma: outlineBlur * pixels)
            .cropped(to: extent)
            .applyingFilter("CIColorMatrix", parameters: [
                "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 16),
                "inputBiasVector": CIVector(x: 0, y: 0, z: 0, w: -0.35),
            ])
            .applyingFilter("CIColorClamp")
        let outline = CIImage(color: finish.outline).cropped(to: extent)
            .applyingFilter("CIBlendWithAlphaMask", parameters: [
                kCIInputBackgroundImageKey: CIImage.empty(),
                kCIInputMaskImageKey: edge,
            ])
        let shadow = edge
            .applyingFilter("CIColorMatrix", parameters: [
                "inputRVector": CIVector(x: 0, y: 0, z: 0, w: 0),
                "inputGVector": CIVector(x: 0, y: 0, z: 0, w: 0),
                "inputBVector": CIVector(x: 0, y: 0, z: 0, w: 0),
                "inputAVector": CIVector(x: 0, y: 0, z: 0, w: finish.shadowOpacity),
            ])
            .clampedToExtent()
            .applyingGaussianBlur(sigma: shadowBlur * pixels)
            .transformed(by: CGAffineTransform(translationX: 0, y: -shadowOffset * pixels))
            .cropped(to: extent)
        let composed = input.composited(over: outline.composited(over: shadow))
        guard let output = context.createCGImage(composed, from: extent) else { return nil }
        return UIImage(cgImage: output, scale: scale, orientation: .up)
    }

    private static func key(_ emoji: String, _ finish: StickerFinish, _ scale: CGFloat) -> NSString {
        "\(emoji)|\(finish.id)@\(scale)" as NSString
    }

    nonisolated(unsafe) private static let cache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.countLimit = 32
        return cache
    }()

    nonisolated(unsafe) private static let context = CIContext(options: [.cacheIntermediates: false])
}

/// The outline and shadow a sticker is cut with, per appearance.
///
/// Light mode keeps the white die-cut. On the dark chat's black a white rim
/// shouts over emoji that are colourful enough already, so dark mode cuts the
/// sticker from near-black: the same silhouette, a rim that separates
/// overlapping stickers without drawing attention, and a lighter shadow.
struct StickerFinish: Sendable, Hashable {
    let id: String
    let outline: CIColor
    let shadowOpacity: CGFloat

    static let light = StickerFinish(id: "light", outline: CIColor(red: 1, green: 1, blue: 1), shadowOpacity: 0.12)
    static let dark = StickerFinish(
        id: "dark",
        outline: CIColor(red: 10 / 255, green: 10 / 255, blue: 11 / 255),
        shadowOpacity: 0.08
    )

    static func of(_ scheme: ColorScheme) -> StickerFinish {
        scheme == .dark ? .dark : .light
    }
}
#endif
