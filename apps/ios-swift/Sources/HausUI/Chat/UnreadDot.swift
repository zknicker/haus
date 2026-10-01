import SwiftUI

/// The phone's one mark for waiting work: a filled disc in the reader's own
/// ink, wherever a surface says something is unread.
///
/// It is the whole vocabulary — the phone never counts. A number a reader
/// cannot act on costs a chip's worth of color and width to say what the disc
/// already said, so the drawer, the Inbox, and Search all wear this instead.
struct UnreadDot: View {
    /// What a row inside a box shows, and what the sidebar shows in its gutter.
    static let inlineDiameter: CGFloat = 8

    var diameter: CGFloat = UnreadDot.inlineDiameter

    var body: some View {
        Circle()
            .fill(.primary)
            .frame(width: diameter, height: diameter)
            .accessibilityHidden(true)
    }
}

extension View {
    /// The sidebar's placement of that mark: the whole disc, centred in the
    /// gutter between the sidebar's leading edge and the row's glyph column,
    /// the way Mail and Messages hang theirs. `listInset` is how far the row's
    /// own leading edge sits inside the sidebar's edge, and `glyphInset` how
    /// far the glyph sits inside the row's.
    ///
    /// It used to straddle the sidebar's edge for the scroll view's clip to
    /// cut in half; on device that read as a clipped half-circle rather than a
    /// mark, so the disc now sits fully inside the gutter.
    ///
    /// Every row in the drawer marks unread this way — the Inbox included, so
    /// the column reads as one system rather than one row keeping its own
    /// score.
    func sidebarUnreadDot(_ isUnread: Bool, listInset: CGFloat, glyphInset: CGFloat) -> some View {
        overlay(alignment: .leading) {
            if isUnread {
                UnreadDot()
                    .offset(x: (glyphInset - listInset - UnreadDot.inlineDiameter) / 2)
            }
        }
    }
}
