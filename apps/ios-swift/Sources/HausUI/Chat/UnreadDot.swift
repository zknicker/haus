import SwiftUI

/// The phone's one mark for waiting work: a filled disc in the reader's own
/// ink, wherever a surface says something is unread.
///
/// It is the whole vocabulary — the phone never counts. A number a reader
/// cannot act on costs a chip's worth of color and width to say what the disc
/// already said, so the drawer, the Inbox, and Search all wear this instead.
struct UnreadDot: View {
    /// What a row inside a box shows: the whole disc, at the width the
    /// sidebar's halved one leaves standing past its edge.
    static let inlineDiameter: CGFloat = 8
    /// What the sidebar hangs off its leading edge for that edge to cut in
    /// half. Half of this is what the reader actually sees.
    static let sidebarDiameter: CGFloat = 14

    var diameter: CGFloat = UnreadDot.inlineDiameter

    var body: some View {
        Circle()
            .fill(.primary)
            .frame(width: diameter, height: diameter)
            .accessibilityHidden(true)
    }
}

extension View {
    /// The sidebar's placement of that mark: pushed out until its centre lands
    /// on the sidebar's leading edge, where the scroll view's clip takes the
    /// other half. `listInset` is how far the row's own leading edge sits
    /// inside that edge.
    ///
    /// Every row in the drawer marks unread this way — the Inbox included, so
    /// the column reads as one system rather than one row keeping its own
    /// score.
    func sidebarUnreadDot(_ isUnread: Bool, listInset: CGFloat) -> some View {
        overlay(alignment: .leading) {
            if isUnread {
                UnreadDot(diameter: UnreadDot.sidebarDiameter)
                    .offset(x: -listInset - UnreadDot.sidebarDiameter / 2)
            }
        }
    }
}
