import SwiftUI

/// Unread conversation, newest activity first, each row quoting the line that
/// is waiting and trailing its age and the unread dot.
struct InboxConversationsSection: View {
    let rows: [InboxConversationRow]?
    let now: Date
    let onOpen: (InboxOpenRequest) -> Void

    var body: some View {
        InboxSectionView(title: "Conversations") {
            if let rows {
                if rows.isEmpty {
                    InboxSectionEmpty(description: "You're caught up.")
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
                                HStack(spacing: 8) {
                                    if let lastActivityAt = row.lastActivityAt {
                                        Text(
                                            HausCompactRelativeTime.label(
                                                for: lastActivityAt,
                                                now: now
                                            )
                                        )
                                        .monospacedDigit()
                                    }
                                    if row.isUnread { UnreadDot() }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
