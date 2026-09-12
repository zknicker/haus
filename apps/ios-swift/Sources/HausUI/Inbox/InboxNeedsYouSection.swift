import SwiftUI

/// Work waiting on this human: open Asks addressed to them, then claims an
/// Agent took and stopped short of finishing — two records, one list.
///
/// Both reads make the same claim, that nothing needs you, so the section stays
/// neutral until both have settled rather than emptying and then filling.
struct InboxNeedsYouSection: View {
    let rows: [InboxNeedsYouRow]?
    let onOpen: (InboxOpenRequest) -> Void

    var body: some View {
        InboxSectionView(title: "Needs you") {
            if let rows {
                if rows.isEmpty {
                    InboxSectionEmpty(description: "Nothing needs you.")
                } else {
                    InboxSectionRows {
                        ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                            if index > 0 { InboxRowDivider() }
                            InboxRowView(
                                mark: row.mark,
                                title: row.title,
                                preview: nil,
                                onOpen: { onOpen(row.open) }
                            ) {
                                Text(row.meta).lineLimit(1)
                            }
                        }
                    }
                }
            }
        }
    }
}
