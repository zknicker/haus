import SwiftUI

/// One Inbox section: a stock List `Section` whose header is the section's
/// label. The List's grouped surface is the box under it, so a section draws
/// no card of its own — rows sit on `inboxCardRow()`, and the week strip sits
/// on `inboxBareRow()` because its cards already carry their own edges.
struct InboxSectionView<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        Section {
            content
        } header: {
            Text(title)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .textCase(nil)
        }
    }
}

/// The settled, genuinely empty section: one quiet row in the same box the rows
/// would have filled, so a quiet section keeps the section's shape instead of
/// changing it to say so.
struct InboxSectionEmpty: View {
    let description: String

    var body: some View {
        Text(description)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, InboxMetrics.rowInset)
            .padding(.vertical, 14)
            .inboxCardRow()
    }
}

extension View {
    /// A row on the section's grouped surface. The row owns its own insets, so
    /// the mark lands on the same column it did before the page was a List.
    ///
    /// The surface is the List's own cell background, never a
    /// `listRowBackground`: on iOS 26 a custom row background stays square
    /// and still while the row swipes, so the system cannot lift the row into
    /// its rounded swipe shape beside the action.
    func inboxCardRow() -> some View {
        listRowInsets(EdgeInsets())
    }

    /// A row with no surface: the greeting and the week strip read as page
    /// content, not as a card.
    func inboxBareRow() -> some View {
        listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
    }
}
