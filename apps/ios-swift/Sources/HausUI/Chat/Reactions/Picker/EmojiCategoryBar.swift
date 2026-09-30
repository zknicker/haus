import SwiftUI

#if os(iOS)

/// One symbol per section along the picker's bottom edge, the current one in
/// the accent, like the system emoji keyboard's own bar.
struct EmojiCategoryBar: View {
    let sections: [EmojiGridSection]
    let current: String
    let onSelect: (String) -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(sections) { section in
                let isCurrent = section.id == current
                Button { onSelect(section.id) } label: {
                    Image(systemName: Self.symbol(for: section.id))
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(isCurrent ? Color.accentColor : Color.secondary)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(section.title ?? section.id)
                .accessibilityAddTraits(isCurrent ? .isSelected : [])
            }
        }
        .padding(.horizontal, 8)
        .background(alignment: .top) { Divider() }
        .background(HausPlatformColor.groupedBackground)
    }

    /// Unicode's group names, as the dataset spells them.
    static func symbol(for sectionID: String) -> String {
        switch sectionID {
        case EmojiGridSection.frequentID: "clock"
        case "Smileys & Emotion": "face.smiling"
        case "People & Body": "hand.wave"
        case "Animals & Nature": "pawprint"
        case "Food & Drink": "fork.knife"
        case "Travel & Places": "car"
        case "Activities": "soccerball"
        case "Objects": "lightbulb"
        case "Symbols": "number"
        case "Flags": "flag"
        default: "square.grid.2x2"
        }
    }
}
#endif
