import SwiftUI

/// Every unread Chat, newest activity first, as Messages-style two-line rows:
/// name and age, then the waiting line. Opening the row reads it; **Mark read**
/// is a trailing (swipe-left) action revealing an icon-only circle, with a
/// full swipe committing it, and it also rides the row's long-press menu. It is
/// never leading: the sidebar drawer owns every right-drag on the canvas, and a
/// leading action would fire alongside it. The long-press lifts the
/// Chat into its own peek card rather than the bare row.
///
/// The section renders nothing until the Chat list has settled rather than
/// emptying and then filling.
struct InboxUnreadSection: View {
    let rows: [InboxUnreadRow]?
    let now: Date
    let onOpen: (InboxOpenRequest) -> Void
    let onMarkRead: (String) -> Void
    /// A swipe's Mark read, which the page confirms with a success haptic.
    var onSwipedRead: () -> Void = {}

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
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            // Icon-only, as Messages draws it: the system
                            // renders a bare image as a circle with no title.
                            Button {
                                // A swipe commits under the finger, so it
                                // confirms by touch; the menu's Mark Read
                                // confirms by the row leaving.
                                onSwipedRead()
                                onMarkRead(row.id)
                            } label: {
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
