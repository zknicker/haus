#if canImport(UIKit)
import SwiftUI
import UIKit

/// Paints a reference's mark: a channel's glyph in its colored box, an Agent's
/// or human's avatar falling back to `AvatarView`'s initials, or the flat glyph
/// every other kind wears, in that reference's own label ink.
enum RichReferenceMarkPainter {
    /// `NSLayoutManager` draws on the main thread, but it is not main-actor
    /// isolated in the SDK and the avatar and glyph caches the mark reads are.
    /// The hop is asserted rather than awaited, and the one value crossing it
    /// is the drawing context this very thread is holding.
    static func draw(
        reference: RichReferencePresentation,
        in rect: CGRect,
        context: CGContext
    ) {
        nonisolated(unsafe) let context = context
        MainActor.assumeIsolated {
            drawMark(reference: reference, in: rect, context: context)
        }
    }

    @MainActor
    private static func drawMark(
        reference: RichReferencePresentation,
        in rect: CGRect,
        context: CGContext
    ) {
        switch reference.mark {
        case .channel(let appearance):
            drawChannel(appearance: appearance, in: rect, context: context)
        case .avatar:
            drawIdentity(reference: reference, in: rect, context: context)
        case .glyph(let name):
            drawGlyph(
                UIIconCatalog.shared.subpaths(for: name, weight: 2),
                in: rect,
                tint: RichReferenceChipInk.labelTint(for: reference),
                context: context
            )
        case .brandGlyph(let name, let brand):
            drawGlyph(
                UIIconCatalog.shared.subpaths(for: name, weight: 2),
                in: rect,
                tint: RichReferenceChipInk.brandTint(brand),
                context: context
            )
        }
    }

    @MainActor
    private static func drawChannel(
        appearance: ChannelAppearance,
        in rect: CGRect,
        context: CGContext
    ) {
        context.saveGState()
        RichReferenceChipInk.markGround(for: appearance).setFill()
        UIBezierPath(roundedRect: rect, cornerRadius: HausRadius.mark(side: rect.height)).fill()
        context.restoreGState()

        // The App pairs a 24pt box with a 16pt glyph. A catalog that has not
        // finished loading, or a name it does not carry, draws the hash.
        let glyphSize = (rect.height * 2 / 3).rounded()
        let subpaths = ChannelIconCatalog.shared.subpaths(for: appearance.icon)
            ?? UIIconCatalog.shared.subpaths(for: .channel, weight: 2)
        let box = CGRect(
            x: rect.midX - glyphSize / 2,
            y: rect.midY - glyphSize / 2,
            width: glyphSize,
            height: glyphSize
        )
        drawGlyph(subpaths, in: box, tint: RichReferenceChipInk.markTint(for: appearance), context: context)
    }

    @MainActor
    private static func drawIdentity(
        reference: RichReferencePresentation,
        in rect: CGRect,
        context: CGContext
    ) {
        if let url = reference.avatarURL, let image = AvatarImageCache.shared.image(for: url) {
            context.saveGState()
            context.addEllipse(in: rect)
            context.clip()
            image.draw(in: aspectFill(image.size, in: rect))
            context.restoreGState()
            return
        }
        context.saveGState()
        RichReferenceChipInk.initialsGround.setFill()
        context.fillEllipse(in: rect)
        context.restoreGState()
        drawInitials(initials(for: reference.label), in: rect)
    }

    @MainActor
    private static func drawGlyph(
        _ subpaths: [HugeiconSubpath],
        in rect: CGRect,
        tint: UIColor,
        context: CGContext
    ) {
        let scale = min(rect.width, rect.height)
        context.saveGState()
        context.translateBy(x: rect.minX, y: rect.minY)
        context.setFillColor(tint.cgColor)
        context.setStrokeColor(tint.cgColor)
        for subpath in subpaths {
            let path = subpath.path.applying(CGAffineTransform(scaleX: scale, y: scale)).cgPath
            context.addPath(path)
            if let stroke = subpath.stroke {
                context.setLineWidth(stroke.width * scale)
                context.setLineCap(stroke.cap)
                context.setLineJoin(stroke.join)
                context.strokePath()
            } else {
                context.fillPath(using: subpath.evenOdd ? .evenOdd : .winding)
            }
        }
        context.restoreGState()
    }

    @MainActor
    private static func drawInitials(_ initials: String, in rect: CGRect) {
        let text = NSAttributedString(
            string: initials,
            attributes: [
                .font: UIFont.systemFont(ofSize: rect.height * 0.38, weight: .medium),
                .foregroundColor: RichReferenceChipInk.initialsTint,
            ]
        )
        let size = text.size()
        text.draw(at: CGPoint(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2))
    }

    private static func aspectFill(_ size: CGSize, in rect: CGRect) -> CGRect {
        guard size.width > 0, size.height > 0 else { return rect }
        let scale = max(rect.width / size.width, rect.height / size.height)
        let filled = CGSize(width: size.width * scale, height: size.height * scale)
        return CGRect(
            x: rect.midX - filled.width / 2,
            y: rect.midY - filled.height / 2,
            width: filled.width,
            height: filled.height
        )
    }

    private static func initials(for name: String) -> String {
        name.split(separator: " ")
            .prefix(2)
            .compactMap(\.first)
            .map(String.init)
            .joined()
            .uppercased()
    }
}
#endif
