import SwiftUI

#if os(iOS)

/// Emoji sections in one lazy grid. Headers report where they sit so the
/// category bar can follow the scroll, and a jump scrolls a header to the top.
struct EmojiGrid: View {
    let sections: [EmojiGridSection]
    let catalog: EmojiCatalog
    let jump: EmojiGridJump?
    @Binding var currentSection: String
    let onPick: (String) -> Void

    /// Header offsets change every scrolled frame; they live outside SwiftUI
    /// state so only a change of section re-renders the picker.
    @State private var headerOffsets = HeaderOffsets()
    @State private var toneTarget: String?

    private let columns = [GridItem(.adaptive(minimum: 44), spacing: 2)]

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVGrid(columns: columns, alignment: .leading, spacing: 2) {
                    ForEach(sections) { section in
                        Section {
                            ForEach(section.emoji, id: \.self) { emoji in
                                cell(emoji)
                            }
                        } header: {
                            header(section)
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 12)
            }
            .coordinateSpace(name: Self.space)
            .scrollDismissesKeyboard(.immediately)
            .onChange(of: jump) { _, jump in
                guard let jump else { return }
                proxy.scrollTo(jump.sectionID, anchor: .top)
                currentSection = jump.sectionID
            }
        }
    }

    @ViewBuilder
    private func header(_ section: EmojiGridSection) -> some View {
        if let title = section.title {
            Text(title)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 4)
                .padding(.top, 12)
                .padding(.bottom, 4)
                .id(section.id)
                .accessibilityAddTraits(.isHeader)
                .onGeometryChange(for: CGFloat.self) { geometry in
                    geometry.frame(in: .named(Self.space)).minY
                } action: { minY in
                    headerOffsets.values[section.id] = minY
                    let current = headerOffsets.current(in: sections.map(\.id))
                    if current != currentSection { currentSection = current }
                }
        }
    }

    private func cell(_ emoji: String) -> some View {
        let entry = catalog.entry(for: emoji)
        return EmojiGridCell(
            emoji: emoji,
            name: entry?.name ?? emoji,
            takesTones: entry?.supportsSkinTones == true,
            isShowingTones: Binding(
                get: { toneTarget == emoji },
                set: { if !$0, toneTarget == emoji { toneTarget = nil } }
            ),
            onPick: onPick,
            onShowTones: { toneTarget = emoji }
        )
    }

    private nonisolated static let space = "emojiGrid"

    @MainActor
    final class HeaderOffsets {
        var values: [String: CGFloat] = [:]

        /// The last section whose header has reached the top of the grid.
        func current(in order: [String]) -> String {
            order.last { (values[$0] ?? .infinity) <= 12 } ?? order.first ?? ""
        }
    }
}

/// One emoji. A press picks it; a long press on an emoji that takes skin
/// tones offers them in a popover, the way the system keyboard does.
private struct EmojiGridCell: View {
    let emoji: String
    let name: String
    let takesTones: Bool
    @Binding var isShowingTones: Bool
    let onPick: (String) -> Void
    let onShowTones: () -> Void
    @State private var suppressTap = false

    var body: some View {
        Button {
            if suppressTap { suppressTap = false } else { onPick(emoji) }
        } label: {
            Text(emoji)
                .font(.system(size: 32))
                .frame(maxWidth: .infinity, minHeight: 46)
        }
        .buttonStyle(EmojiCellStyle())
        .simultaneousGesture(LongPressGesture(minimumDuration: 0.4).onEnded { _ in
            guard takesTones else { return }
            suppressTap = true
            onShowTones()
        }, including: takesTones ? .all : .subviews)
        .accessibilityLabel(name)
        .modifier(SkinToneAction(takesTones: takesTones, onShowTones: onShowTones))
        .popover(isPresented: $isShowingTones) {
            HStack(spacing: 2) {
                ForEach(variants, id: \.emoji) { variant in
                    Button { onPick(variant.emoji) } label: {
                        Text(variant.emoji)
                            .font(.system(size: 30))
                            .frame(width: 44, height: 46)
                    }
                    .buttonStyle(EmojiCellStyle())
                    .accessibilityLabel(variant.label)
                }
            }
            .padding(6)
            .presentationCompactAdaptation(.popover)
        }
    }

    /// The emoji as drawn, then each tone the Server accepts.
    private var variants: [(emoji: String, label: String)] {
        [(emoji, name)] + EmojiSkinTone.allCases.compactMap { tone in
            tone.applied(to: emoji).map { ($0, "\(name), \(tone.name)") }
        }
    }
}

/// VoiceOver's way to the tones a long press shows.
private struct SkinToneAction: ViewModifier {
    let takesTones: Bool
    let onShowTones: () -> Void

    func body(content: Content) -> some View {
        if takesTones {
            content.accessibilityAction(named: "Skin tones", onShowTones)
        } else {
            content
        }
    }
}

private struct EmojiCellStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(
                Color.primary.opacity(configuration.isPressed ? 0.1 : 0),
                in: .haus(HausRadius.small)
            )
            .contentShape(.rect)
    }
}
#endif
