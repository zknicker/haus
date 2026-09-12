import SwiftUI

/// One Inbox section: the label at the page column's left edge, and below it
/// whatever that section shows. Three sections put a bordered group of rows
/// there; the week strip puts its cards there instead, because cards already
/// carry their own edges.
struct InboxSectionView<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .padding(.horizontal, InboxMetrics.pageInset)
            content
        }
    }
}

/// The box under a section's label: its rows, separated, inside one group.
struct InboxSectionRows<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: 0) { content }
            .background(
                HausPlatformColor.groupedSurface,
                in: .rect(cornerRadius: InboxMetrics.boxRadius)
            )
            .overlay(
                RoundedRectangle(cornerRadius: InboxMetrics.boxRadius)
                    .strokeBorder(Color.primary.opacity(0.07))
            )
            .padding(.horizontal, InboxMetrics.pageInset)
    }
}

/// The settled, genuinely empty section: one quiet row in the same box the rows
/// would have filled, so a quiet section keeps the section's shape instead of
/// changing it to say so.
struct InboxSectionEmpty: View {
    let description: String

    var body: some View {
        InboxSectionRows {
            Text(description)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, InboxMetrics.rowInset)
                .padding(.vertical, 14)
        }
    }
}

/// The divider between a pair of rows. The first row carries none, so the box
/// never opens on a rule.
struct InboxRowDivider: View {
    var body: some View {
        Divider().padding(.leading, InboxMetrics.rowInset + inboxMarkSize + 10)
    }
}
