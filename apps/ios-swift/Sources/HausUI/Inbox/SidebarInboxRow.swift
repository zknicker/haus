import SwiftUI

/// The sidebar's anchor: Inbox, marked by the Haus ghost where a product's
/// wordmark would sit. Nothing else shares its line.
///
/// Waiting work shows as the disc every Chat row below hangs off the sidebar's
/// leading edge, never as a number: the Inbox's own "Needs you" total is a
/// count the reader cannot act on, and a chip on this row alone would break
/// the column's one grammar. Like theirs it shows nothing at zero, which is
/// also what it reads while the Store cannot answer honestly yet, so it never
/// ticks upward in front of the reader.
///
/// The mark is the iridescent ghost, not the app-icon tile: it shares a glyph
/// column with Tasks directly below it, and a filled blue tile beside a stroked
/// checklist reads as a different kind of thing rather than the row above it.
/// It is drawn a size above those boxed glyphs on purpose — the one glyph in
/// the column that names the product where the others name a screen — and it
/// grows inside the shared column, centred on the same midline, so the `Inbox`
/// label stays on the `Tasks` label's edge whatever size the mark takes. Its
/// mesh drifts, quicker while an Agent here is working.
struct SidebarInboxRow: View {
    let needsYouCount: Int
    let glyphSize: CGFloat
    let ghostTempo: HausGhostTempo
    let glyphColumn: CGFloat
    let capsuleBleed: CGFloat
    let listInset: CGFloat
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 10) {
                HausGhost(fill: .iridescent, animated: true, tempo: ghostTempo, size: glyphSize)
                    .frame(width: glyphColumn, height: glyphColumn)
                Text("Inbox")
                Spacer(minLength: 0)
            }
            .foregroundStyle(.primary)
            .padding(.horizontal, capsuleBleed)
            .frame(height: 42)
            .sidebarUnreadDot(needsYouCount > 0, listInset: listInset)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressableRow(cornerRadius: 21))
        .accessibilityLabel(needsYouCount > 0 ? "Inbox, needs you" : "Inbox")
    }
}
