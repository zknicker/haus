import SwiftUI

/// Every unread Chat, newest activity first, as Messages-style two-line rows:
/// name and age, then the waiting line. Opening the row reads it; **Mark read**
/// is a leading swipe revealing an icon-only circle, the way Messages marks a
/// conversation, with a full swipe committing it, and it also rides the row's
/// long-press menu. The long-press lifts the
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
                            trailing: row.lastActivityAt.map {
                                HausCompactRelativeTime.label(for: $0, now: now)
                            },
                            detail: row.preview
                        ) {
                            onOpen(.chat(row.id))
                        }
                        .contextMenu {
                            Button { onMarkRead(row.id) } label: {
                                Label("Mark Read", systemImage: "envelope.open")
                            }
                        } preview: {
                            InboxUnreadPeek(row: row, now: now)
                        }
                        .swipeActions(edge: .leading, allowsFullSwipe: true) {
                            // Icon-only, as Messages draws it: the system
                            // renders a bare image as a circle with no title.
                            Button { onMarkRead(row.id) } label: {
                                Image(systemName: "envelope.open.fill")
                            }
                            .tint(.blue)
                            .accessibilityLabel("Mark read")
                        }
                        .inboxCardRow()
                    }
                }
            }
        }
    }
}
