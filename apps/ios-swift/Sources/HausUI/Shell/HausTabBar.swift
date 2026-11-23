import SwiftUI

/// One icon in the tab bar. A missing `image` falls back to the symbol.
public struct HausTabBarItem<Tab: Hashable>: Identifiable {
    public let tab: Tab
    public let label: String
    public let systemImage: String
    public let image: Image?

    public init(_ tab: Tab, label: String, systemImage: String, image: Image? = nil) {
        self.tab = tab
        self.label = label
        self.systemImage = systemImage
        self.image = image
    }

    public var id: Tab { tab }
}

/// The bottom chrome measured from Capy: a 49pt glass capsule of icon-only
/// tabs, with the "Ask anything" field 9pt above it when there is one.
/// Collapsed, it folds into three glass pieces on one row: the selected tab,
/// a shorter field, and the last tab (Search). The selected tab unfolds it.
public struct HausBottomChrome<Tab: Hashable>: View {
    @Binding private var selection: Tab
    private let items: [HausTabBarItem<Tab>]
    private let isCollapsed: Bool
    private let onExpand: () -> Void
    private let onAsk: (() -> Void)?

    public static var barHeight: CGFloat { 49 }
    public static var accessoryHeight: CGFloat { 47 }
    public static var gap: CGFloat { 9 }
    static var pieceSize: CGFloat { 48 }

    public init(
        selection: Binding<Tab>,
        items: [HausTabBarItem<Tab>],
        isCollapsed: Bool = false,
        onExpand: @escaping () -> Void = {},
        onAsk: (() -> Void)?
    ) {
        _selection = selection
        self.items = items
        self.isCollapsed = isCollapsed
        self.onExpand = onExpand
        self.onAsk = onAsk
    }

    public var body: some View {
        GlassEffectContainer(spacing: Self.gap) {
            if isCollapsed, let pieces = collapsedPieces {
                collapsed(leading: pieces.leading, trailing: pieces.trailing)
                    .transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .bottom)))
            } else {
                expanded
                    .transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .bottom)))
            }
        }
        .animation(.spring(duration: 0.4, bounce: 0.18), value: isCollapsed)
    }

    private var expanded: some View {
        VStack(spacing: Self.gap) {
            if let onAsk { askField(onAsk, height: Self.accessoryHeight) }
            HausTabBar(selection: $selection, items: items)
                .glassEffect(.regular.interactive(), in: .capsule)
        }
        .padding(.horizontal, 21)
    }

    private func collapsed(leading: HausTabBarItem<Tab>, trailing: HausTabBarItem<Tab>) -> some View {
        HStack(spacing: 14) {
            Button(action: onExpand) { piece(leading) }
                .buttonStyle(.plain)
                .glassEffect(.regular.interactive(), in: .circle)
                .accessibilityLabel(leading.label)
                .accessibilityHint("Shows every tab")
            if let onAsk {
                askField(onAsk, height: Self.pieceSize)
            } else {
                Spacer(minLength: 0)
            }
            Button { selection = trailing.tab } label: { piece(trailing) }
                .buttonStyle(.plain)
                .glassEffect(.regular.interactive(), in: .circle)
                .accessibilityLabel(trailing.label)
        }
        .padding(.horizontal, 28)
        .padding(.bottom, 6)
    }

    /// Collapsed pieces exist only away from the last tab, which they keep.
    private var collapsedPieces: (leading: HausTabBarItem<Tab>, trailing: HausTabBarItem<Tab>)? {
        guard let trailing = items.last, trailing.tab != selection,
              let leading = items.first(where: { $0.tab == selection })
        else { return nil }
        return (leading, trailing)
    }

    private func piece(_ item: HausTabBarItem<Tab>) -> some View {
        HausTabBarIcon(item: item, isSelected: item.tab == selection)
            .frame(width: Self.pieceSize, height: Self.pieceSize)
            .contentShape(Circle())
    }

    private func askField(_ action: @escaping () -> Void, height: CGFloat) -> some View {
        AskAnythingAccessory(action: action)
            .frame(height: height)
            .glassEffect(.regular.interactive(), in: .capsule)
    }
}

