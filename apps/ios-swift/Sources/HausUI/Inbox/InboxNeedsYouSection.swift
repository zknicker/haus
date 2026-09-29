import SwiftUI

/// Conversations addressed to this human that they have not answered, each
/// with the one control an Inbox row carries: **Done**.
///
/// The read makes one claim, that nothing needs you, so the section stays
/// neutral until it has settled rather than emptying and then filling.
struct InboxNeedsYouSection: View {
    let rows: [InboxNeedsYouRow]?
    let now: Date
    let onOpen: (InboxOpenRequest) -> Void
    let onDone: (String) -> Void

    var body: some View {
        InboxSectionView(title: "Needs you") {
            if let rows {
                if rows.isEmpty {
                    InboxSectionEmpty(description: "Nothing needs you.")
                } else {
                    InboxSectionRows {
                        ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                            if index > 0 { InboxRowDivider() }
                            // Done sits beside the press target rather than
                            // inside it, so no control nests in another.
                            HStack(spacing: 0) {
                                InboxRowView(
                                    mark: row.mark,
                                    title: row.title,
                                    preview: row.preview,
                                    onOpen: { onOpen(row.open) }
                                ) {
                                    Text(meta(row)).lineLimit(1).monospacedDigit()
                                }
                                InboxDoneButton(name: row.title) { onDone(row.id) }
                            }
                            .transition(.opacity)
                        }
                    }
                    .animation(.easeOut(duration: 0.22), value: rows.map(\.id))
                }
            }
        }
    }

    private func meta(_ row: InboxNeedsYouRow) -> String {
        let time = HausCompactRelativeTime.label(for: row.latestAt, now: now)
        return row.context.map { "\($0) · \(time)" } ?? time
    }
}

/// The row's Done: a quiet check at the trailing edge, a full touch target
/// wide, clearing the row until newer addressing brings it back.
private struct InboxDoneButton: View {
    let name: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HausIcon(.complete, size: 20)
                .foregroundStyle(.secondary)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.trailing, 4)
        .accessibilityLabel("Done")
        .accessibilityHint("Clears \(name) from Needs you")
    }
}
