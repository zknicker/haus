import SwiftUI

#if os(iOS)

/// The drawer at rest: quick reaction tiles, who reacted, and the message's
/// actions as inset grouped cards.
struct MessageActionList: View {
    /// Nil where the screen has no live reaction board.
    let quickTiles: [String]?
    let ownEmoji: Set<String>
    let summary: (count: String, names: String)?
    let groups: [[MessageAction]]
    let onReact: (_ emoji: String, _ remove: Bool) -> Void
    let onMore: () -> Void
    let onAction: (MessageAction) -> Void
    /// The list's full content height, which the drawer's detent fits.
    let onHeight: (CGFloat) -> Void

    var body: some View {
        List {
            if let quickTiles {
                Section {
                    QuickReactionTiles(emoji: quickTiles, ownEmoji: ownEmoji, onReact: onReact, onMore: onMore)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
            }
            if let summary {
                Section {
                    NavigationLink(value: MessageActionDrawer.Route.reactors) {
                        Text("\(summary.count)\(Text(" · \(summary.names)").foregroundStyle(.secondary))")
                            .lineLimit(1)
                    }
                    .accessibilityLabel("\(summary.count): \(summary.names)")
                    .accessibilityHint("Shows who reacted")
                }
            }
            ForEach(groups, id: \.self) { group in
                Section {
                    ForEach(group) { action in
                        Button { onAction(action) } label: {
                            HStack {
                                Text(action.title)
                                Spacer(minLength: 12)
                                Image(systemName: action.systemImage)
                                    .foregroundStyle(.secondary)
                            }
                            .contentShape(.rect)
                        }
                        .foregroundStyle(.primary)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(.compact)
        .scrollContentBackground(.hidden)
        // Room under the grabber.
        .contentMargins(.top, 18, for: .scrollContent)
        .onScrollGeometryChange(for: CGFloat.self) { geometry in
            geometry.contentSize.height + geometry.contentInsets.top
        } action: { _, height in
            onHeight(height)
        }
    }
}

/// A row of rounded square tiles, one per quick emoji, then the smiley that
/// opens the picker. An emoji the viewer already stuck on the message is
/// tinted, and pressing it takes the reaction back.
struct QuickReactionTiles: View {
    let emoji: [String]
    let ownEmoji: Set<String>
    let onReact: (_ emoji: String, _ remove: Bool) -> Void
    let onMore: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            ForEach(emoji, id: \.self) { emoji in
                let own = ownEmoji.contains(emoji)
                Button { onReact(emoji, own) } label: {
                    Text(emoji).font(.system(size: 26))
                }
                .buttonStyle(QuickReactionTileStyle(isSelected: own))
                .accessibilityLabel(own ? "Remove \(Self.name(emoji))" : "React with \(Self.name(emoji))")
                .accessibilityAddTraits(own ? .isSelected : [])
            }
            Button(action: onMore) {
                Image(systemName: "face.smiling")
                    .font(.system(size: 22, weight: .regular))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(QuickReactionTileStyle(isSelected: false))
            .accessibilityLabel("More emoji")
        }
    }

    static func name(_ emoji: String) -> String {
        EmojiCatalog.shared.entry(for: emoji)?.name ?? emoji
    }
}

/// A tile on the card surface, tinted with the accent when selected, dimming
/// under the finger the way a grouped row highlights.
private struct QuickReactionTileStyle: ButtonStyle {
    let isSelected: Bool

    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle.haus(HausRadius.medium)
        configuration.label
            .frame(maxWidth: .infinity)
            .aspectRatio(1, contentMode: .fit)
            .frame(maxHeight: 56)
            .background(isSelected ? Color.accentColor.opacity(0.18) : HausPlatformColor.groupedSurface, in: shape)
            .overlay {
                if isSelected { shape.strokeBorder(Color.accentColor, lineWidth: 1.5) }
            }
            .overlay { shape.fill(Color.primary.opacity(configuration.isPressed ? 0.08 : 0)) }
            .contentShape(shape)
    }
}
#endif
