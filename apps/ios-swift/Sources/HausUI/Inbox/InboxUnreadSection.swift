import SwiftUI

/// Every unread Chat, newest activity first, each row quoting the line that is
/// waiting and trailing its age. Opening the row reads it; **Mark read** lives
/// in the row's long-press menu, the way Mail keeps it off the row itself, so
/// the preview keeps the full width. The long-press lifts the Chat into its
/// own peek card rather than the bare row.
///
/// The section stays neutral until the Chat list has settled rather than
/// emptying and then filling.
struct InboxUnreadSection: View {
    let rows: [InboxUnreadRow]?
    let now: Date
    let onOpen: (InboxOpenRequest) -> Void
    let onMarkRead: (String) -> Void

    var body: some View {
        InboxSectionView(title: "Unread") {
            if let rows {
                if rows.isEmpty {
                    InboxSectionEmpty(description: "All caught up.")
                } else {
                    InboxSectionRows {
                        ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                            if index > 0 { InboxRowDivider() }
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
                            .accessibilityAction(named: "Mark read") { onMarkRead(row.id) }
                            .transition(.opacity)
                        }
                    }
                    .animation(.easeOut(duration: 0.22), value: rows.map(\.id))
                }
            }
        }
    }
}
