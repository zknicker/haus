import SwiftUI

/// The bar's icons over one selection pill. A press anywhere on the bar lifts
/// the pill into a glass bubble that follows the finger, the way the system
/// tab bar does, and lets go onto the tab under it.
struct HausTabBar<Tab: Hashable>: View {
    @Binding var selection: Tab
    let items: [HausTabBarItem<Tab>]
    @Environment(\.colorScheme) private var colorScheme
    /// The finger's x across the bar while it is down.
    @State private var pressX: CGFloat?

    private static var inset: CGFloat { 3 }
    private static var pillHeight: CGFloat { 42 }

    var body: some View {
        GeometryReader { proxy in
            let slot = (proxy.size.width - 2 * Self.inset) / CGFloat(max(items.count, 1))
            ZStack(alignment: .leading) {
                pill(slot: slot)
                HStack(spacing: 0) {
                    ForEach(items) { item in
                        Button { selection = item.tab } label: {
                            HausTabBarIcon(item: item, isSelected: item.tab == highlighted(slot: slot))
                                .frame(width: slot, height: Self.pillHeight)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(item.label)
                        .accessibilityAddTraits(item.tab == selection ? .isSelected : [])
                    }
                }
            }
            .padding(.horizontal, Self.inset)
            .frame(height: proxy.size.height)
            .contentShape(Capsule())
            .highPriorityGesture(press(slot: slot))
            .animation(.spring(duration: 0.32, bounce: 0.22), value: pressX == nil)
            .animation(.spring(duration: 0.32, bounce: 0.22), value: selection)
        }
        .frame(height: HausBottomChrome<Tab>.barHeight)
        .sensoryFeedback(.selection, trigger: selection)
    }

    @ViewBuilder
    private func pill(slot: CGFloat) -> some View {
        if let pressX {
            Capsule()
                .fill(.clear)
                .frame(width: slot * 1.12, height: Self.pillHeight * 1.12)
                .glassEffect(.regular.interactive(), in: .capsule)
                .offset(x: clamped(pressX, slot: slot) - slot * 0.56 - Self.inset)
        } else if let index = items.firstIndex(where: { $0.tab == selection }) {
            Capsule()
                .fill(.black.opacity(colorScheme == .dark ? 0.45 : 0.07))
                .frame(width: slot, height: Self.pillHeight)
                .offset(x: CGFloat(index) * slot)
        }
    }

    private func press(slot: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { pressX = $0.location.x }
            .onEnded { value in
                if let tab = tab(at: value.location.x, slot: slot) { selection = tab }
                pressX = nil
            }
    }

    /// The tab under the finger while it is down, otherwise the selection.
    private func highlighted(slot: CGFloat) -> Tab? {
        guard let pressX else { return selection }
        return tab(at: pressX, slot: slot)
    }

    private func tab(at x: CGFloat, slot: CGFloat) -> Tab? {
        guard !items.isEmpty, slot > 0 else { return nil }
        let index = Int(((x - Self.inset) / slot).rounded(.down))
        return items[min(max(index, 0), items.count - 1)].tab
    }

    /// The bubble's center, kept inside the bar.
    private func clamped(_ x: CGFloat, slot: CGFloat) -> CGFloat {
        let half = slot / 2
        let upper = Self.inset + slot * CGFloat(items.count) - half
        return min(max(x, Self.inset + half), upper)
    }
}

/// A tab's photo or symbol. The selected pill alone marks a photo; a symbol
/// also takes the accent.
struct HausTabBarIcon<Tab: Hashable>: View {
    let item: HausTabBarItem<Tab>
    let isSelected: Bool

    var body: some View {
        if let image = item.image {
            image
                .resizable()
                .frame(width: 26, height: 26)
                .clipShape(Circle())
        } else {
            Image(systemName: item.systemImage)
                .font(.system(size: 19, weight: .medium))
                .foregroundStyle(isSelected ? HausPlatformColor.accent : HausPlatformColor.label)
        }
    }
}
