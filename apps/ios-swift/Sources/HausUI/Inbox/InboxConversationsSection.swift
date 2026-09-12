import SwiftUI

/// Unread conversation, newest activity first, each row quoting the line that
/// is waiting and trailing its age and unread count.
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
                                    InboxUnreadCountChip(count: row.unreadCount)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/// A count badge for waiting work: a Chat's unread messages, and the sidebar's
/// Inbox count. One owner for the cap and the chip's shape, so the sidebar row
/// and the Inbox never disagree about what 100 waiting items looks like.
struct InboxUnreadCountChip: View {
    let count: Int

    var body: some View {
        Text(count > 99 ? "99+" : "\(count)")
            .font(.caption2.weight(.semibold))
            .monospacedDigit()
            .foregroundStyle(.white)
            .padding(.horizontal, 6)
            .frame(minWidth: 20, minHeight: 18)
            .background(Color.accentColor, in: .capsule)
            .accessibilityLabel("\(count) unread")
    }
}
