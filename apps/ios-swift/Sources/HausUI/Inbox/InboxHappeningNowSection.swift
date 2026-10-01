import SwiftUI

/// Work running right now, whether or not this human started it: the Cloud
/// Agent work a delegation left running, then the Agents currently in a turn.
///
/// This is where background work that outlives an Agent turn stays observable.
struct InboxHappeningNowSection: View {
    let rows: [InboxHappeningNowRow]?
    let onOpen: (InboxOpenRequest) -> Void

    var body: some View {
        if let rows {
            InboxSectionView(title: "Happening now") {
                if rows.isEmpty {
                    InboxSectionEmpty(description: "No agents are working right now.")
                } else {
                    ForEach(rows) { row in
                        InboxRowView(
                            mark: row.mark,
                            title: row.title,
                            preview: row.preview,
                            onOpen: { onOpen(row.open) }
                        ) {
                            if let meta = row.meta {
                                Text(meta).lineLimit(1)
                            }
                        }
                        .inboxCardRow()
                    }
                }
            }
        }
    }
}
