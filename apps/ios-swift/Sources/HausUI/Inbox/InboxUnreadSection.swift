import HausModels
import SwiftUI

/// Every unread Chat and followed Task, newest activity first. A
/// conversation is a Messages-style two-line row: name and age, then the
/// waiting line. A Task row adds a line for its key and state under its
/// title. Opening the row reads it; **Mark read** is a trailing (swipe-left)
/// action revealing an icon-only circle, with a full swipe committing it, and
/// it also rides the row's long-press menu. It is never leading: the sidebar
/// drawer owns every right-drag on the canvas, and a leading action would fire
/// alongside it. The long-press lifts the Chat into its own peek card rather
/// than the bare row.
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
                        unreadRow(row)
                    }
                }
            }
        }
    }

    private func unreadRow(_ row: InboxUnreadRow) -> some View {
        InboxRowView(
            mark: row.mark,
            title: row.title,
            trailing: row.lastActivityAt.map {
                HausCompactRelativeTime.label(for: $0, now: now)
            },
            facts: row.facts,
            detail: row.preview
        ) {
            onOpen(row.open)
        }
        .contextMenu {
            Button { onMarkRead(row.id) } label: {
                Label("Mark Read", systemImage: "envelope.open")
            }
        } preview: {
            InboxUnreadPeek(row: row, now: now)
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            markReadSwipe {
                onMarkRead(row.id)
            }
        }
        .inboxCardRow()
    }

    /// Icon-only, as Messages draws it: the system renders a bare image as a
    /// circle with no title. A swipe commits under the finger, so it confirms
    /// by touch; the menu's Mark Read confirms by the row leaving.
    private func markReadSwipe(_ markRead: @escaping () -> Void) -> some View {
        Button {
            onSwipedRead()
            markRead()
        } label: {
            Image(systemName: "envelope.open.fill")
        }
        .tint(.blue)
        .accessibilityLabel("Mark read")
    }
}
