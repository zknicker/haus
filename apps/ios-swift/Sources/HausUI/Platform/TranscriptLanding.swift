import CoreGraphics

/// Where a transcript lands to open on a first unread reply, the web App's
/// `threadLandingScrollTop` on the flipped table: newest at the table's top,
/// so a row's visual top is its `maxY`, the table's top inset is the visual
/// bottom clearance (the composer), and its bottom inset the visual top
/// clearance (the navigation bar).
struct TranscriptLanding {
    /// How much of the reply must show for it to count as already in view.
    static let readableHeight: CGFloat = 48
    /// The reply before the landing that stays in view under the top clearance.
    static let contextHeight: CGFloat = 48

    /// The row's frame in table coordinates.
    let rowMinY: CGFloat
    let rowMaxY: CGFloat
    let contentOffsetY: CGFloat
    let boundsHeight: CGFloat
    let bottomClearance: CGFloat
    let topClearance: CGFloat
    /// The resting (newest) offset and the oldest offset the content allows.
    let minOffsetY: CGFloat
    let maxOffsetY: CGFloat

    /// The offset to move to, or nil to stay put because the reply's top
    /// already reads between the clearances.
    var targetOffsetY: CGFloat? {
        let visualTop = contentOffsetY + boundsHeight - topClearance
        let fold = contentOffsetY + bottomClearance
        let readable = min(rowMaxY - rowMinY, Self.readableHeight)
        if rowMaxY <= visualTop, rowMaxY - readable >= fold { return nil }
        let target = rowMaxY + Self.contextHeight - boundsHeight + topClearance
        return min(max(minOffsetY, target), max(minOffsetY, maxOffsetY))
    }
}
