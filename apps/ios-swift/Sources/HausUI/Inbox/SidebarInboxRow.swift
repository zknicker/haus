import SwiftUI

/// The sidebar's anchor: Inbox, marked by the Haus app mark rather than a
/// glyph, where a product's wordmark would sit. Nothing else shares its line.
///
/// The badge is the Inbox's own "Needs you" total, wearing the same chip the
/// Chat rows wear for unread messages and, like them, showing nothing at zero.
/// It stays silent until the Store can answer honestly, so it never ticks
/// upward in front of the reader.
///
/// The mark is a filled tile rather than a stroked glyph, so it sits a little
/// inside the glyph column the way an app icon does beside a label — the App
/// draws it at the same 22px identity-mark box.
struct SidebarInboxRow: View {
    let needsYouCount: Int
    let glyphColumn: CGFloat
    let capsuleBleed: CGFloat
    let onOpen: () -> Void

    private static let markSize: CGFloat = 22

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 10) {
                HausBrandMark()
                    .frame(width: Self.markSize, height: Self.markSize)
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
