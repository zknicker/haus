import SwiftUI

/// Every unread Chat, newest activity first, each row quoting the line that is
/// waiting and trailing its age. Opening the row reads it; **Mark read** is a
/// leading swipe, the way Mail reads a message, with a full swipe committing
/// it, and it also rides the row's long-press menu. The long-press lifts the
/// Chat into its own peek card rather than the bare row.
///
/// The section renders nothing until the Chat list has settled rather than
/// emptying and then filling.
struct InboxUnreadSection: View {
    let rows: [InboxUnreadRow]?
    let now: Date
    let onOpen: (InboxOpenRequest) -> Void
    let onMarkRead: (String) -> Void

    var body: some View {
        if let rows {
            InboxSectionView(title: "Unread") {
                if rows.isEmpty {
                    InboxSectionEmpty(description: "All caught up.")
                } else {
                    ForEach(rows) { row in
                        InboxRowView(
                            mark: row.mark,
                            title: row.title,
                            preview: row.preview,
                            onOpen: { onOpen(.chat(row.id)) }
                        ) {
                            if let lastActivityAt = row.lastActivityAt {
                                Text(HausCompactRelativeTime.label(for: lastActivityAt, now: now))
                                    .lineLimit(1)
                                    .monospacedDigit()
                            }
                        }
                        .contextMenu {
                            Button { onMarkRead(row.id) } label: {
                                Label("Mark Read", systemImage: "envelope.open")
                            }
                        } preview: {
                            InboxUnreadPeek(row: row, now: now)
                        }
                        .swipeActions(edge: .leading, allowsFullSwipe: true) {
                            Button { onMarkRead(row.id) } label: {
                                Label("Read", systemImage: "envelope.open.fill")
                            }
                            .tint(.blue)
                        }
                        .inboxCardRow()
                    }
                }
            }
        }
    }
}
