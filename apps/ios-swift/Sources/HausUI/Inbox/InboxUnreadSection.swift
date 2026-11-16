import HausModels
import SwiftUI

/// Every unread Chat and Thread and every assigned Task, newest activity first.
/// A conversation is a Messages-style two-line row: name and age, then the
/// waiting line. Opening the row reads it; **Mark read** is a trailing
/// (swipe-left) action revealing an icon-only circle, with a full swipe
/// committing it, and it also rides the row's long-press menu. It is never
/// leading: the sidebar drawer owns every right-drag on the canvas, and a
/// leading action would fire alongside it. The long-press lifts the Chat into
/// its own peek card rather than the bare row. A Task is worked in place
/// (`InboxTaskRow`) and takes the same trailing swipe.
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
    var onMoveTask: (InboxTaskItem, BoardColumn) -> Void = { _, _ in }
    var onMarkTaskRead: (InboxTaskItem) -> Void = { _ in }
    var onReplyToTask: (InboxTaskItem, String) async -> Bool = { _, _ in false }

    var body: some View {
        if let rows {
            InboxSectionView(title: "Unread") {
                if rows.isEmpty {
                    InboxSectionEmpty(description: "All caught up.")
                } else {
                    ForEach(rows) { row in
                        switch row.kind {
                        case .conversation:
                            conversationRow(row)
                        case .task(let item):
                            taskRow(item, open: row.open)
                        }
                    }
                }
            }
        }
    }

    private func conversationRow(_ row: InboxUnreadRow) -> some View {
        InboxRowView(
            mark: row.mark,
            title: row.title,
            trailing: row.lastActivityAt.map {
                HausCompactRelativeTime.label(for: $0, now: now)
            },
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

    private func taskRow(_ item: InboxTaskItem, open: InboxOpenRequest) -> some View {
        InboxTaskRow(
            item: item,
            now: now,
            onOpen: { onOpen(open) },
            onMove: { onMoveTask(item, $0) },
            onMarkRead: { onMarkTaskRead(item) },
            onReply: { await onReplyToTask(item, $0) }
        )
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            markReadSwipe {
                onMarkTaskRead(item)
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
