import SwiftUI

/// A filter in a row above a list: a 33pt capsule with a medium label.
///
/// Selected chips invert against the canvas; unselected ones sit on the fill
/// with a 1pt edge. A menu chip carries a trailing chevron, and an add chip a
/// leading faint plus.
struct FilterChip: View {
    enum Accessory: Equatable, Sendable {
        case none
        case menu
        case add
    }

    private let title: String
    private let isSelected: Bool
    private let accessory: Accessory
    private let action: () -> Void

    @ScaledMetric(relativeTo: .callout) private var height: CGFloat = 33

    init(
        _ title: String,
        isSelected: Bool = false,
        accessory: Accessory = .none,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.isSelected = isSelected
        self.accessory = accessory
        self.action = action
    }

    var body: some View {
        let style = FilterChipStyle(isSelected: isSelected)
        Button(action: action) {
            HStack(spacing: 6) {
                if accessory == .add {
                    glyph("plus").foregroundStyle(style.addGlyphInk.color)
                }
                Text(title)
                    .hausFont(.chip)
                    .lineLimit(1)
                if accessory == .menu {
                    glyph("chevron.down")
                }
            }
            .padding(.horizontal, 13)
            .frame(height: height)
            .foregroundStyle(style.ink.color)
            .background(style.fill.color, in: .capsule)
            .overlay {
                if style.edgeWidth > 0 {
                    Capsule().strokeBorder(HausPlatformColor.edge, lineWidth: style.edgeWidth)
                }
            }
            .contentShape(.capsule)
        }
        .buttonStyle(.pressable)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private func glyph(_ systemName: String) -> some View {
        Image(systemName: systemName)
            .hausFont(.chipGlyph)
            .accessibilityHidden(true)
    }
}

/// How a chip paints for its selection state.
struct FilterChipStyle: Equatable {
    let fill: HausTone
    let ink: HausTone
    let addGlyphInk: HausTone
    let edgeWidth: CGFloat

    init(isSelected: Bool) {
        if isSelected {
            fill = .selectedFill
            ink = .selectedInk
            addGlyphInk = .selectedInk
            edgeWidth = 0
        } else {
            fill = .fill
            ink = .ink
            addGlyphInk = .faintInk
            edgeWidth = 1
        }
    }
}

/// A horizontally scrolling row of ``FilterChip``s, inset to the page margin.
struct FilterChipRow<Content: View>: View {
    private let inset: CGFloat
    @ViewBuilder private let content: () -> Content

    init(inset: CGFloat = 20, @ViewBuilder content: @escaping () -> Content) {
        self.inset = inset
        self.content = content
    }

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                content()
            }
        }
        .scrollIndicators(.hidden)
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
        .contentMargins(.horizontal, inset, for: .scrollContent)
    }
}
