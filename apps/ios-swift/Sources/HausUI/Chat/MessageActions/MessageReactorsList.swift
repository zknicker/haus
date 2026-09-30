import SwiftUI

#if os(iOS)

/// Who reacted, pushed inside the drawer: one single-line row per sticker,
/// the viewer's own first with a checkmark. Pressing one of those takes the
/// reaction back; anyone else's row is information only.
struct MessageReactorsList: View {
    let rows: [ReactionSticker]
    let onRemove: (String) -> Void

    var body: some View {
        List {
            Section {
                ForEach(rows) { row in
                    if row.reactor.isViewer {
                        Button { onRemove(row.emoji) } label: { line(row) }
                            .foregroundStyle(.primary)
                            .accessibilityHint("Removes your reaction")
                    } else {
                        line(row)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .navigationTitle("Reactions")
        .hausInlineNavigationTitle()
        .toolbar(.visible, for: .navigationBar)
    }

    private func line(_ row: ReactionSticker) -> some View {
        HStack(spacing: 12) {
            Text(row.emoji)
                .font(.title3)
                .accessibilityHidden(true)
            Text(row.reactor.name)
                .lineLimit(1)
            Spacer(minLength: 8)
            if row.reactor.isViewer {
                Image(systemName: "checkmark")
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.accentColor)
                    .accessibilityHidden(true)
            }
        }
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(row.reactor.name), \(QuickReactionTiles.name(row.emoji))")
    }
}
#endif
