import SwiftUI

/// The sidebar's anchor: Inbox, marked by the Haus ghost where a product's
/// wordmark would sit. Nothing else shares its line.
///
/// Any unread Chat shows as the disc every Chat row below wears in the
/// sidebar's leading gutter, never as a number: a total is a count the reader
/// cannot act on, and a chip on this row alone would break the column's one
/// grammar. Like theirs it shows nothing when nothing is unread, which is also
/// what it reads while the Store cannot answer honestly yet, so it never ticks
/// upward in front of the reader.
///
/// The mark is the iridescent ghost, not the app-icon tile: it shares a glyph
/// column with Tasks directly below it, and a filled blue tile beside a stroked
/// checklist reads as a different kind of thing rather than the row above it.
/// It is drawn at the column's size here — the one glyph in the column that
/// names the product where the others name a screen — and it grows inside the
/// shared column, centred on the same midline, so the `Inbox` label stays on
/// the `Tasks` label's edge whatever size the mark takes. Its mesh drifts,
/// quicker while an Agent here is working, and not at all while the drawer
/// holding it is shut.
struct SidebarInboxRow: View {
    let hasUnread: Bool
    let ghostTempo: HausGhostTempo
    let metrics: SidebarRowMetrics
    let isSelected: Bool
    let onOpen: () -> Void

    @Environment(\.hausSidebarHidden) private var sidebarHidden

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 10) {
                HausGhost(
                    fill: .iridescent,
                    animated: true,
                    tempo: ghostTempo,
                    paused: sidebarHidden,
                    size: metrics.glyph
                )
                    .frame(width: metrics.glyph, height: metrics.glyph)
                Text("Inbox")
                    .lineLimit(metrics.titleLineLimit)
                Spacer(minLength: 0)
            }
            .foregroundStyle(.primary)
            .sidebarRowFrame(metrics, isSelected: isSelected)
            .sidebarUnreadDot(hasUnread, listInset: metrics.listInset, glyphInset: metrics.capsuleBleed)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressableRow(cornerRadius: metrics.pressRadius))
        .accessibilityLabel(hasUnread ? "Inbox, unread" : "Inbox")
    }
}
