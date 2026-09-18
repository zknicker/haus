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

    /// The plate behind a code span, drawn per line fragment and hugging the
    /// span's own glyphs.
    ///
    /// Neither `.backgroundColor` nor `enumerateEnclosingRects` can do this.
    /// Both answer in selection geometry, which runs to the right margin on
    /// every line but the span's last — so a span broken across two lines
    /// painted a grey bar from its last word out to the edge of the column.
    /// The bounding rect of the glyphs on each line hugs the words instead.
    private func drawCodePlate(
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
    private static let codePlateInset: CGFloat = 1.5
    private static let codePlateRadius: CGFloat = 4

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

/// Where one line fragment of a reference run puts its mark and its dotted
/// rule, given the glyph rects the text engine reports for that fragment.
///
/// Reading both from real glyph rects is the whole of the direction
/// independence. In an RTL paragraph — a Hebrew or Arabic name in a message
/// whose base direction resolves right to left — the leading spacer advances
/// at the *right* of the run, so a mark placed at the fragment's left edge
/// lands on the label's final glyphs and a rule started a spacer's width in
/// from that edge runs under blank space. Here the mark rides whichever side
/// of the spacer faces away from the label, and the rule is the label's own
/// extent with nothing added to it.
struct RichReferenceRunPiece: Equatable {
    /// The x `RichReferenceMarkGeometry.markRect(leadingX:baselineY:scale:)`
    /// is drawn from, or `nil` on a fragment that carries no spacer: a wrapped
    /// continuation wears the rule alone.
    let markLeadingX: CGFloat?
    /// The rule's span: the label's own glyphs, and never the spacer or the
    /// space a wrapped label ends its line with.
    let underlineFromX: CGFloat
    let underlineToX: CGFloat

    /// - Parameters:
    ///   - attachment: the leading spacer attachment's glyph box, when this
    ///     fragment holds it.
    ///   - label: the fragment's label glyphs, trailing whitespace already
    ///     dropped.
    ///   - markSize: the mark's edge, which is how far back from the spacer's
    ///     right side its leading edge sits when the run runs right to left.
    init(attachment: CGRect?, label: CGRect?, markSize: CGFloat) {
        let from = label?.minX ?? attachment?.minX ?? 0
        underlineFromX = from
        underlineToX = label?.maxX ?? from
        guard let attachment else {
            markLeadingX = nil
            return
        }
        // The label tells the run's direction: it follows the spacer on the
        // right going one way and on the left going the other.
        let rightToLeft = (label?.midX ?? attachment.midX) < attachment.midX
        markLeadingX = rightToLeft ? attachment.maxX - markSize : attachment.minX
    }

    /// The run's leading spacer: an attachment for the mark's room, held
    /// against the label by a word joiner. Neither belongs under the rule.
    static let spacerCharacters: Set<unichar> = [0xFFFC, 0x2060]
}

extension NSLayoutManager {
    /// The glyph the run's leading spacer attachment was laid out as, or `nil`
    /// when the drawn range does not reach it — a run clipped past its own
    /// start has no mark to place, in either direction.
    func referenceSpacerGlyph(inCharacterRange characters: NSRange) -> Int? {
        guard let storage = textStorage, characters.length > 0,
              (storage.string as NSString).character(at: characters.location) == 0xFFFC
        else { return nil }
        let glyphs = glyphRange(
            forCharacterRange: NSRange(location: characters.location, length: 1),
            actualCharacterRange: nil
        )
        return glyphs.length > 0 ? glyphs.location : nil
    }

    /// The mark and rule placement for one line fragment's slice of a run.
    ///
    /// - Parameter characters: the run's own character range. A glyph range is
    ///   asked which characters it drew rather than the other way round,
    ///   because the reverse question has no answer under bidi reordering.
    func referenceRunPiece(
        glyphs piece: NSRange,
        characters run: NSRange,
        spacerGlyph: Int?,
        markSize: CGFloat,
        in container: NSTextContainer
    ) -> RichReferenceRunPiece {
        let attachment = spacerGlyph.flatMap { glyph -> CGRect? in
            guard NSLocationInRange(glyph, piece) else { return nil }
            return boundingRect(forGlyphRange: NSRange(location: glyph, length: 1), in: container)
        }
        return RichReferenceRunPiece(
            attachment: attachment,
            label: referenceLabelBounds(glyphs: piece, characters: run, in: container),
            markSize: markSize
        )
    }

    /// The fragment's label glyphs alone, in the geometry a selection is drawn
    /// with.
    ///
    /// A glyph's own `boundingRect` is measured to wherever the next glyph
    /// starts, so across a bidi level boundary — a Latin label inside a
    /// paragraph that runs right to left — it reaches back over the mark's
    /// spacer and into the neighbouring word. `enumerateEnclosingRects` reports
    /// what the engine paints when those characters are selected, which is
    /// tight running either way.
    private func referenceLabelBounds(
        glyphs piece: NSRange,
        characters run: NSRange,
        in container: NSTextContainer
    ) -> CGRect? {
        guard let characters = referenceLabelCharacters(glyphs: piece, characters: run)
        else { return nil }
        let glyphs = glyphRange(forCharacterRange: characters, actualCharacterRange: nil)
        guard glyphs.length > 0 else { return nil }
        var label: CGRect?
        enumerateEnclosingRects(
            forGlyphRange: glyphs,
            withinSelectedGlyphRange: glyphs,
            in: container
        ) { rect, _ in
            label = label.map { $0.union(rect) } ?? rect
        }
        return label
    }

    /// The label characters this fragment drew.
    ///
    /// The glyph range for a character range is a min-to-max span, so under
    /// bidi reordering it swallows whatever the engine put between the label's
    /// first and last glyph. Asking each glyph which character it drew instead
    /// gives the same answer running either way. The spacer, its joiner, and
    /// the space a wrapped label ends its line with are never the label's ink;
    /// a space *inside* it stays, the words on both sides being in the span.
    private func referenceLabelCharacters(glyphs piece: NSRange, characters run: NSRange) -> NSRange? {
        guard let storage = textStorage else { return nil }
        let text = storage.string as NSString
        var first: Int?
        var last: Int?
        for glyph in piece.location..<piece.upperBound {
            let character = characterIndexForGlyph(at: glyph)
            guard NSLocationInRange(character, run), character < text.length else { continue }
            let unit = text.character(at: character)
            guard !RichReferenceRunPiece.spacerCharacters.contains(unit), !isWhitespace(unit)
            else { continue }
            first = min(first ?? character, character)
            last = max(last ?? character, character)
        }
        guard let first, let last else { return nil }
        return NSRange(location: first, length: last - first + 1)
    }

    private func isWhitespace(_ unit: unichar) -> Bool {
        guard let scalar = Unicode.Scalar(unit) else { return false }
        return CharacterSet.whitespaces.contains(scalar)
    }
}

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
