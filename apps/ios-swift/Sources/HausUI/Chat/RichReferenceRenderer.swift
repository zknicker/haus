import CoreGraphics
import Foundation

#if canImport(UIKit)
import SwiftUI
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

#if canImport(UIKit)
/// Paints the identity mark and the dotted rule on every reference run.
///
/// This is TextKit 1. A reference has no ground — the App's chip is the
/// transparent `tertiary` shell — so what is drawn is the mark at the run's
/// leading edge and a dotted rule under the label's own glyphs, both anchored
/// to real glyphs on their own baseline.
/// `NSLayoutManager.drawBackground(forGlyphRange:at:)` is the
/// hook the text engine already calls with the container origin in view
/// coordinates — nothing has to be mapped out of a fragment's private space.
/// The stack is built explicitly in `RichMessageTextView` rather than left to
/// `UITextView`, whose choice between TextKit 1 and 2 depends on which
/// properties the view has been asked for.
final class RichReferenceLayoutManager: NSLayoutManager {
    /// Where a mention's words may come apart. `NSLayoutManager.delegate` is
    /// weak, so the answering object is owned here.
    private let lineBreaker = RichReferenceLineBreaker()

    override init() {
        super.init()
        delegate = lineBreaker
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("RichReferenceLayoutManager is built in code")
    }

    /// Claims the delegate back. `UITextView` is handed this manager already
    /// built, and the break policy failing silently would look like the
    /// character wrapping it exists to remove, so the seat is taken again once
    /// the view owns the stack.
    func claimLineBreaking() {
        guard delegate !== lineBreaker else { return }
        delegate = lineBreaker
    }

    override func drawBackground(forGlyphRange glyphsToShow: NSRange, at origin: CGPoint) {
        super.drawBackground(forGlyphRange: glyphsToShow, at: origin)
        guard let storage = textStorage,
              let container = textContainers.first,
              let context = UIGraphicsGetCurrentContext()
        else { return }

        let characters = characterRange(forGlyphRange: glyphsToShow, actualGlyphRange: nil)
        storage.enumerateAttribute(.hausCodeSpan, in: characters) { value, range, _ in
            guard value != nil else { return }
            drawCodePlate(characterRange: range, origin: origin, container: container, context: context)
        }
        storage.enumerateAttribute(.hausReference, in: characters) { value, range, _ in
            guard let run = value as? RichReferenceRun else { return }
            draw(run: run, characterRange: range, origin: origin, container: container, context: context)
        }
    }

    private func draw(
        run: RichReferenceRun,
        characterRange: NSRange,
        origin: CGPoint,
        container: NSTextContainer,
        context: CGContext
    ) {
        let glyphs = glyphRange(forCharacterRange: characterRange, actualCharacterRange: nil)
        guard glyphs.length > 0 else { return }
        let spacer = referenceSpacerGlyph(inCharacterRange: characterRange)

        // A run that wraps wears one rule per line. The rects come from the
        // line fragments it touches rather than from one bounding box, which
        // would span the whole column.
        enumerateLineFragments(forGlyphRange: glyphs) { [weak self] lineRect, _, _, lineGlyphs, _ in
            guard let self else { return }
            let piece = NSIntersectionRange(glyphs, lineGlyphs)
            guard piece.length > 0 else { return }
            // `location(forGlyphAt:)` is relative to the line fragment rect, so
            // the baseline is the one number everything here is anchored to.
            let baseline = lineRect.minY + self.location(forGlyphAt: piece.location).y + origin.y
            // Where the mark and the rule land, read from the glyphs the
            // engine laid out rather than from the fragment's own box: the
            // fragment's left edge is the run's leading edge only when the
            // paragraph runs left to right.
            let placement = self.referenceRunPiece(
                glyphs: piece,
                characters: characterRange,
                spacerGlyph: spacer,
                markSize: run.geometry.markSize,
                in: container
            )

            RichReferenceRulePainter.draw(
                reference: run.reference,
                underline: run.geometry.underline,
                fromX: placement.underlineFromX + origin.x,
                toX: placement.underlineToX + origin.x,
                baselineY: baseline,
                context: context
            )

            // The mark rides the run's leading edge, so only the fragment
            // holding the spacer it stands in draws one.
            guard let markLeadingX = placement.markLeadingX else { return }
            RichReferenceMarkPainter.draw(
                reference: run.reference,
                in: run.geometry.markRect(
                    leadingX: markLeadingX + origin.x,
                    baselineY: baseline,
                    scale: run.reference.mark.sizeScale
                ),
                context: context
            )
        }
    }
}
#endif


#if canImport(UIKit)
/// Paints the dotted rule under a reference's label, in the label's own ink.
///
/// The dots are the App's: a dot every other dot's width, under the label's
/// glyphs alone — never under the mark, and never under the space that follows
/// the words.
enum RichReferenceRulePainter {
    /// Same hop as the mark painter: `NSLayoutManager` draws on the main thread
    /// without being main-actor isolated, and the ink it reads is.
    static func draw(
        reference: RichReferencePresentation,
        underline: RichReferenceUnderline,
        fromX: CGFloat,
        toX: CGFloat,
        baselineY: CGFloat,
        context: CGContext
    ) {
        let centers = underline.dotCenters(fromX: fromX, toX: toX)
        guard !centers.isEmpty else { return }
        nonisolated(unsafe) let context = context
        MainActor.assumeIsolated {
            context.saveGState()
            RichReferenceChipInk.labelTint(for: reference).setFill()
            let dots = CGMutablePath()
            for center in centers {
                dots.addEllipse(in: underline.dotRect(centerX: center, baselineY: baselineY))
            }
            context.addPath(dots)
            context.fillPath()
            context.restoreGState()
        }
    }
}
#endif
