import SwiftUI

/// The sidebar's anchor: Inbox, marked by the Haus ghost where a product's
/// wordmark would sit. Nothing else shares its line.
///
/// The badge is the Inbox's own "Needs you" total, wearing the same chip the
/// Chat rows wear for unread messages and, like them, showing nothing at zero.
/// It stays silent until the Store can answer honestly, so it never ticks
/// upward in front of the reader.
///
/// The mark is the iridescent ghost, not the app-icon tile: it shares a glyph
/// column with Tasks directly below it, and a filled blue tile beside a stroked
/// checklist reads as a different kind of thing rather than the row above it.
/// It sits a size above those boxed glyphs rather than matching them — the
/// App's own proportion for this row, which names the product where they name a
/// screen — and its mesh drifts, quicker while an Agent here is working.
struct SidebarInboxRow: View {
    let needsYouCount: Int
    let glyphSize: CGFloat
    let ghostTempo: HausGhostTempo
    let glyphColumn: CGFloat
    let capsuleBleed: CGFloat
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 10) {
                HausGhost(fill: .iridescent, animated: true, tempo: ghostTempo, size: glyphSize)
                    .frame(width: glyphColumn, height: glyphColumn)
                Text("Inbox")
                Spacer(minLength: 0)
                if needsYouCount > 0 {
                    InboxUnreadCountChip(count: needsYouCount)
                }
            }
            .foregroundStyle(.primary)
            .padding(.horizontal, capsuleBleed)
            .frame(height: 42)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressableRow(cornerRadius: 21))
        .accessibilityLabel(
            needsYouCount > 0 ? "Inbox, \(needsYouCount) needs you" : "Inbox"
        )
    }
}
