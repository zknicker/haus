import CoreGraphics
import Foundation

#if canImport(UIKit)
import UIKit

/// The plate a code span sits on, drawn per line fragment and hugging the
/// span's own glyphs.
///
/// It is drawn here rather than by `.backgroundColor` because both that
/// attribute and `enumerateEnclosingRects` answer in selection geometry, which
/// runs to the right margin on every line but a span's last — so a span broken
/// across two lines painted a grey bar from its last word out to the edge of
/// the column. The bounding rect of the glyphs on each line hugs the words
/// instead.
extension RichReferenceLayoutManager {
    func drawCodePlate(
        characterRange: NSRange,
        origin: CGPoint,
        container: NSTextContainer,
        context: CGContext
    ) {
        let glyphs = glyphRange(forCharacterRange: characterRange, actualCharacterRange: nil)
        context.saveGState()
        context.setFillColor(RichReferenceChipInk.codeGround.cgColor)
        enumerateLineFragments(forGlyphRange: glyphs) { [weak self] _, _, _, lineGlyphs, _ in
            guard let self else { return }
            let shared = NSIntersectionRange(glyphs, lineGlyphs)
            guard shared.length > 0 else { return }
            let plate = self.boundingRect(forGlyphRange: shared, in: container)
                .offsetBy(dx: origin.x, dy: origin.y)
                .insetBy(dx: -Self.codePlateInset, dy: Self.codePlateInset)
            guard plate.width > 0, plate.height > 0 else { return }
            context.addPath(
                UIBezierPath(roundedRect: plate, cornerRadius: Self.codePlateRadius).cgPath
            )
            context.fillPath()
        }
        context.restoreGState()
    }

    /// The span breathes a little sideways and sits inside the line's own box,
    /// so one line's plate never touches the plate on the line above it.
    static let codePlateInset: CGFloat = 1.5
    static let codePlateRadius: CGFloat = 4
}
#endif
