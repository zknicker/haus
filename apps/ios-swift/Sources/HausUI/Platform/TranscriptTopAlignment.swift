import CoreGraphics

enum TranscriptMargins {
    /// The rows' side margin, the app's 20 pt screen margin.
    static let side: CGFloat = 20
}

/// A transcript too short to fill the viewport reads from the top, under the
/// header, the way a short thread does in any chat; the empty room is left
/// below it rather than above. The flipped table gets there with its tail
/// inset: the room the rows leave is added under them, and it shrinks by
/// exactly what each new row adds until the rows reach the header, where the
/// transcript is bottom-anchored as usual.
enum TranscriptTopAlignment {
    /// The visual-bottom clearance that rests the oldest row's top under the
    /// top clearance, never less than the composer's own clearance.
    static func tailInset(
        base: CGFloat,
        boundsHeight: CGFloat,
        topClearance: CGFloat,
        contentHeight: CGFloat
    ) -> CGFloat {
        guard boundsHeight > 0 else { return base }
        return max(base, boundsHeight - topClearance - contentHeight)
    }
}
