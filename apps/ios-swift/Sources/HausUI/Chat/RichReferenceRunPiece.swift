import CoreGraphics
import Foundation

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
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
