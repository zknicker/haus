import SwiftUI

/// The card an Unread row lifts into on long-press, the way Messages peeks a
/// conversation: the Chat's mark and name, its age, and the waiting line in
/// full rather than cut to the row's one line.
///
/// It is its own opaque, fixed-width card so the system draws its standard
/// soft shadow around a clean rounded box instead of tracing the row's
/// content against the section behind it.
struct InboxUnreadPeek: View {
    let row: InboxUnreadRow
    let now: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                InboxMarkView(mark: row.mark)
                Text(row.title)
                    .font(.headline)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let lastActivityAt = row.lastActivityAt {
                    Text(HausCompactRelativeTime.label(for: lastActivityAt, now: now))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
            }
            Text(row.preview)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(InboxUnreadPeekMetrics.previewLines)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(16)
        .frame(width: InboxUnreadPeekMetrics.width)
        .background(HausPlatformColor.groupedSurface)
    }
}

private enum InboxUnreadPeekMetrics {
    /// Messages' peek width on a phone: narrower than the screen, so the card
    /// reads as lifted rather than as the row stretched edge to edge.
    static let width: CGFloat = 320
    static let previewLines = 5
}
